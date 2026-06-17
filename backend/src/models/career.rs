use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
pub struct UpsertCareerRequest {
    pub title: String,
    pub slug: Option<String>,
    pub location: Option<String>,
    pub job_type: Option<String>,
    #[serde(alias = "employment_type")]
    pub employment_type: Option<String>,
    pub experience_required: Option<String>,
    pub description: Option<String>,
    pub requirements: Option<Value>,
    pub responsibilities: Option<Value>,
    pub salary_range: Option<String>,
    pub is_active: Option<bool>,
}

impl UpsertCareerRequest {
    pub fn resolved_job_type(&self) -> String {
        self.job_type
            .clone()
            .or_else(|| self.employment_type.clone())
            .unwrap_or_else(|| "full-time".to_string())
    }
}

