//! Optional AWS S3 backend for uploaded files.
//!
//! When `AWS_S3_BUCKET` is set (with credentials / default chain), uploads are dual-written
//! to local `STORAGE_PATH` and S3. Reads prefer local disk, then fall back to S3 (and cache
//! the object locally for subsequent reads / face-match).

use std::sync::OnceLock;

use aws_config::BehaviorVersion;
use aws_sdk_s3::config::{Credentials, Region};
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client;
use log::{info, warn};

static S3_CLIENT: OnceLock<Option<S3Backend>> = OnceLock::new();

#[derive(Clone)]
struct S3Backend {
    client: Client,
    bucket: String,
    /// Optional key prefix, e.g. `hrm` → objects stored as `hrm/users/….jpg`
    prefix: String,
}

fn configured_bucket() -> Option<String> {
    std::env::var("AWS_S3_BUCKET")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn key_prefix() -> String {
    std::env::var("AWS_S3_PREFIX")
        .ok()
        .unwrap_or_else(|| "hrm".to_string())
        .trim()
        .trim_matches('/')
        .to_string()
}

fn object_key(backend: &S3Backend, relative: &str) -> String {
    let rel = relative.trim().trim_start_matches('/');
    if backend.prefix.is_empty() {
        rel.to_string()
    } else {
        format!("{}/{}", backend.prefix, rel)
    }
}

/// True when S3 uploads/downloads are enabled (lazy-inits the client).
pub fn s3_enabled() -> bool {
    backend().is_some()
}

/// True when `AWS_S3_BUCKET` is set (does not initialize the client).
pub fn s3_configured() -> bool {
    configured_bucket().is_some()
}

fn backend() -> Option<&'static S3Backend> {
    cached_backend().as_ref()
}

fn cached_backend() -> &'static Option<S3Backend> {
    S3_CLIENT.get_or_init(|| {
        let Some(bucket) = configured_bucket() else {
            info!("AWS_S3_BUCKET unset — using local STORAGE_PATH only");
            return None;
        };

        match block_on_future(build_client(bucket)) {
            Ok(backend) => {
                info!(
                    "S3 storage enabled (bucket={}, prefix={})",
                    backend.bucket, backend.prefix
                );
                Some(backend)
            }
            Err(e) => {
                warn!("S3 client init failed ({e}) — local storage only");
                None
            }
        }
    })
}

async fn build_client(bucket: String) -> Result<S3Backend, String> {
    let region = std::env::var("AWS_REGION")
        .or_else(|_| std::env::var("AWS_DEFAULT_REGION"))
        .unwrap_or_else(|_| "ap-south-1".to_string());

    let mut loader = aws_config::defaults(BehaviorVersion::latest()).region(Region::new(region));

    if let (Ok(access), Ok(secret)) = (
        std::env::var("AWS_ACCESS_KEY_ID"),
        std::env::var("AWS_SECRET_ACCESS_KEY"),
    ) {
        if !access.trim().is_empty() && !secret.trim().is_empty() {
            let creds = Credentials::new(
                access.trim(),
                secret.trim(),
                std::env::var("AWS_SESSION_TOKEN").ok(),
                None,
                "hrm-env",
            );
            loader = loader.credentials_provider(creds);
        }
    }

    let shared = loader.load().await;
    let mut s3_conf = aws_sdk_s3::config::Builder::from(&shared);

    if std::env::var("AWS_S3_FORCE_PATH_STYLE")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
    {
        s3_conf = s3_conf.force_path_style(true);
    }

    if let Ok(endpoint) = std::env::var("AWS_S3_ENDPOINT") {
        let endpoint = endpoint.trim();
        if !endpoint.is_empty() {
            s3_conf = s3_conf.endpoint_url(endpoint);
        }
    }

    Ok(S3Backend {
        client: Client::from_conf(s3_conf.build()),
        bucket,
        prefix: key_prefix(),
    })
}

/// Run an async S3 future from sync storage helpers without panicking on runtime flavor.
fn block_on_future<F, T>(fut: F) -> Result<T, String>
where
    F: std::future::Future<Output = Result<T, String>> + Send + 'static,
    T: Send + 'static,
{
    match tokio::runtime::Handle::try_current() {
        Ok(handle) => match handle.runtime_flavor() {
            tokio::runtime::RuntimeFlavor::MultiThread => {
                tokio::task::block_in_place(|| handle.block_on(fut))
            }
            _ => {
                // Current-thread runtime: run on a dedicated worker thread.
                std::thread::spawn(move || {
                    let rt = tokio::runtime::Builder::new_current_thread()
                        .enable_all()
                        .build()
                        .map_err(|e| format!("S3 runtime: {e}"))?;
                    rt.block_on(fut)
                })
                .join()
                .map_err(|_| "S3 worker thread panicked".to_string())?
            }
        },
        Err(_) => {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| format!("S3 runtime: {e}"))?;
            rt.block_on(fut)
        }
    }
}

/// Upload bytes to S3. No-op (Ok) when S3 is not configured.
pub fn put_object(relative: &str, data: &[u8], content_type: &str) -> Result<(), String> {
    let Some(backend) = backend() else {
        return Ok(());
    };
    let key = object_key(backend, relative);
    let bucket = backend.bucket.clone();
    let client = backend.client.clone();
    let body = ByteStream::from(data.to_vec());
    let ct = content_type.to_string();

    block_on_future(async move {
        client
            .put_object()
            .bucket(bucket)
            .key(key)
            .body(body)
            .content_type(ct)
            .send()
            .await
            .map(|_| ())
            .map_err(|e| format!("S3 upload failed: {e}"))
    })
}

/// Download object bytes from S3. `None` when S3 is disabled or object missing.
pub fn get_object(relative: &str) -> Result<Option<Vec<u8>>, String> {
    let Some(backend) = backend() else {
        return Ok(None);
    };
    let key = object_key(backend, relative);
    let bucket = backend.bucket.clone();
    let client = backend.client.clone();

    block_on_future(async move {
        match client.get_object().bucket(bucket).key(key).send().await {
            Ok(out) => {
                let bytes = out
                    .body
                    .collect()
                    .await
                    .map_err(|e| format!("S3 read failed: {e}"))?
                    .into_bytes()
                    .to_vec();
                Ok(Some(bytes))
            }
            Err(e) => {
                let msg = e.to_string();
                if msg.contains("NoSuchKey") || msg.contains("NotFound") || msg.contains("404") {
                    Ok(None)
                } else {
                    Err(format!("S3 download failed: {e}"))
                }
            }
        }
    })
}

/// Delete object from S3. No-op when S3 is not configured.
pub fn delete_object(relative: &str) -> Result<(), String> {
    let Some(backend) = backend() else {
        return Ok(());
    };
    let key = object_key(backend, relative);
    let bucket = backend.bucket.clone();
    let client = backend.client.clone();

    block_on_future(async move {
        client
            .delete_object()
            .bucket(bucket)
            .key(key)
            .send()
            .await
            .map(|_| ())
            .map_err(|e| format!("S3 delete failed: {e}"))
    })
}
