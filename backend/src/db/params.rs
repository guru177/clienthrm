use bytes::BytesMut;
use postgres::types::{IsNull, ToSql, Type};

/// PostgreSQL NULL that accepts any column type (text, int, date, etc.).
#[derive(Clone, Copy, Debug)]
struct PostgresUntypedNull;

impl ToSql for PostgresUntypedNull {
    fn to_sql(
        &self,
        _ty: &Type,
        _out: &mut BytesMut,
    ) -> Result<IsNull, Box<dyn std::error::Error + Sync + Send>> {
        Ok(IsNull::Yes)
    }

    fn to_sql_checked(
        &self,
        _ty: &Type,
        _out: &mut BytesMut,
    ) -> Result<IsNull, Box<dyn std::error::Error + Sync + Send>> {
        Ok(IsNull::Yes)
    }

    fn accepts(_ty: &Type) -> bool {
        true
    }
}

/// Binds a string parameter using the target PostgreSQL column type.
/// Timestamp/date strings are coerced only when the column expects those types.
#[derive(Clone, Debug)]
struct PostgresAdaptiveText(String);

impl PostgresAdaptiveText {
    fn parse_timestamp(s: &str) -> Option<chrono::NaiveDateTime> {
        chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S")
            .ok()
            .or_else(|| {
                chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d")
                    .ok()
                    .map(|d| d.and_hms_opt(0, 0, 0).unwrap())
            })
    }

    fn parse_date(s: &str) -> Option<chrono::NaiveDate> {
        chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
    }
}

impl ToSql for PostgresAdaptiveText {
    fn to_sql(
        &self,
        ty: &Type,
        out: &mut BytesMut,
    ) -> Result<IsNull, Box<dyn std::error::Error + Sync + Send>> {
        self.to_sql_checked(ty, out)
    }

    fn to_sql_checked(
        &self,
        ty: &Type,
        out: &mut BytesMut,
    ) -> Result<IsNull, Box<dyn std::error::Error + Sync + Send>> {
        if matches!(ty, &Type::TIMESTAMP | &Type::TIMESTAMPTZ) {
            if let Some(dt) = Self::parse_timestamp(&self.0) {
                return dt.to_sql_checked(ty, out);
            }
        }
        if ty == &Type::DATE {
            if let Some(d) = Self::parse_date(&self.0) {
                return d.to_sql_checked(ty, out);
            }
        }
        self.0.to_sql_checked(ty, out)
    }

    fn accepts(_ty: &Type) -> bool {
        true
    }
}

#[derive(Clone)]
pub enum ParamValue {
    Null,
    I64(i64),
    I32(i32),
    F64(f64),
    Bool(bool),
    Text(String),
    Blob(Vec<u8>),
    NaiveDateTime(chrono::NaiveDateTime),
    NaiveDate(chrono::NaiveDate),
}

impl ParamValue {
    fn as_sqlite(&self) -> rusqlite::types::Value {
        match self {
            ParamValue::Null => rusqlite::types::Value::Null,
            ParamValue::I64(v) => rusqlite::types::Value::Integer(*v),
            ParamValue::I32(v) => rusqlite::types::Value::Integer(*v as i64),
            ParamValue::F64(v) => rusqlite::types::Value::Real(*v),
            ParamValue::Bool(v) => rusqlite::types::Value::Integer(if *v { 1 } else { 0 }),
            ParamValue::Text(v) => rusqlite::types::Value::Text(v.clone()),
            ParamValue::Blob(v) => rusqlite::types::Value::Blob(v.clone()),
            ParamValue::NaiveDateTime(v) => {
                rusqlite::types::Value::Text(v.format("%Y-%m-%d %H:%M:%S").to_string())
            }
            ParamValue::NaiveDate(v) => {
                rusqlite::types::Value::Text(v.format("%Y-%m-%d").to_string())
            }
        }
    }

    fn as_postgres_box(&self) -> Box<dyn postgres::types::ToSql + Sync + Send> {
        match self {
            ParamValue::Null => Box::new(PostgresUntypedNull),
            ParamValue::I64(v) => {
                // INT4/BIGINT parameters — keep i32/i64 (not i16) for id columns and counts.
                if (*v >= i32::MIN as i64) && (*v <= i32::MAX as i64) {
                    Box::new(*v as i32)
                } else {
                    Box::new(*v)
                }
            }
            ParamValue::I32(v) => {
                if (i16::MIN as i32..=i16::MAX as i32).contains(v) {
                    Box::new(*v as i16)
                } else {
                    Box::new(*v)
                }
            }
            ParamValue::F64(v) => Box::new(*v),
            ParamValue::Bool(v) => Box::new(if *v { 1i16 } else { 0i16 }),
            ParamValue::Text(v) => Box::new(PostgresAdaptiveText(v.clone())),
            ParamValue::Blob(v) => Box::new(v.clone()),
            ParamValue::NaiveDateTime(v) => Box::new(*v),
            ParamValue::NaiveDate(v) => Box::new(*v),
        }
    }
}

#[derive(Clone)]
pub struct Params {
    values: Vec<ParamValue>,
}

impl Params {
    pub fn empty() -> Self {
        Self { values: vec![] }
    }

    pub fn from_values(values: Vec<ParamValue>) -> Params {
        Self { values }
    }

    pub(crate) fn sqlite_values(&self) -> Vec<rusqlite::types::Value> {
        self.values.iter().map(|v| v.as_sqlite()).collect()
    }

    pub(crate) fn postgres_boxes(&self) -> Vec<Box<dyn postgres::types::ToSql + Sync + Send>> {
        self.values.iter().map(|v| v.as_postgres_box()).collect()
    }

    pub(crate) fn postgres_refs<'a>(
        boxes: &'a [Box<dyn postgres::types::ToSql + Sync + Send>],
    ) -> Vec<&'a (dyn postgres::types::ToSql + Sync)> {
        boxes
            .iter()
            .map(|b| b.as_ref() as &(dyn postgres::types::ToSql + Sync))
            .collect()
    }
}

pub trait IntoParamValue {
    fn into_param_value(self) -> ParamValue;
}

impl IntoParamValue for i64 {
    fn into_param_value(self) -> ParamValue {
        ParamValue::I64(self)
    }
}
impl IntoParamValue for i32 {
    fn into_param_value(self) -> ParamValue {
        ParamValue::I32(self)
    }
}
impl IntoParamValue for f64 {
    fn into_param_value(self) -> ParamValue {
        ParamValue::F64(self)
    }
}
impl IntoParamValue for bool {
    fn into_param_value(self) -> ParamValue {
        ParamValue::Bool(self)
    }
}
impl IntoParamValue for String {
    fn into_param_value(self) -> ParamValue {
        ParamValue::Text(self)
    }
}
impl IntoParamValue for &str {
    fn into_param_value(self) -> ParamValue {
        ParamValue::Text(self.to_string())
    }
}
impl IntoParamValue for Option<&str> {
    fn into_param_value(self) -> ParamValue {
        match self {
            Some(v) => ParamValue::Text(v.to_string()),
            None => ParamValue::Null,
        }
    }
}
impl IntoParamValue for &Option<&str> {
    fn into_param_value(self) -> ParamValue {
        match self {
            Some(v) => ParamValue::Text((*v).to_string()),
            None => ParamValue::Null,
        }
    }
}
impl IntoParamValue for &Option<String> {
    fn into_param_value(self) -> ParamValue {
        match self.as_ref() {
            Some(v) => ParamValue::Text(v.clone()),
            None => ParamValue::Null,
        }
    }
}
impl IntoParamValue for &String {
    fn into_param_value(self) -> ParamValue {
        ParamValue::Text(self.clone())
    }
}
impl IntoParamValue for chrono::NaiveDateTime {
    fn into_param_value(self) -> ParamValue {
        ParamValue::NaiveDateTime(self)
    }
}
impl IntoParamValue for &chrono::NaiveDateTime {
    fn into_param_value(self) -> ParamValue {
        ParamValue::NaiveDateTime(*self)
    }
}

impl IntoParamValue for &&chrono::NaiveDateTime {
    fn into_param_value(self) -> ParamValue {
        ParamValue::NaiveDateTime(**self)
    }
}

impl IntoParamValue for chrono::NaiveDate {
    fn into_param_value(self) -> ParamValue {
        ParamValue::NaiveDate(self)
    }
}

impl IntoParamValue for &chrono::NaiveDate {
    fn into_param_value(self) -> ParamValue {
        ParamValue::NaiveDate(*self)
    }
}

impl IntoParamValue for Vec<u8> {
    fn into_param_value(self) -> ParamValue {
        ParamValue::Blob(self)
    }
}
impl IntoParamValue for Option<i64> {
    fn into_param_value(self) -> ParamValue {
        match self {
            Some(v) => ParamValue::I64(v),
            None => ParamValue::Null,
        }
    }
}
impl IntoParamValue for Option<i32> {
    fn into_param_value(self) -> ParamValue {
        match self {
            Some(v) => ParamValue::I32(v),
            None => ParamValue::Null,
        }
    }
}
impl IntoParamValue for Option<String> {
    fn into_param_value(self) -> ParamValue {
        match self {
            Some(v) => ParamValue::Text(v),
            None => ParamValue::Null,
        }
    }
}
impl IntoParamValue for Option<f64> {
    fn into_param_value(self) -> ParamValue {
        match self {
            Some(v) => ParamValue::F64(v),
            None => ParamValue::Null,
        }
    }
}
impl IntoParamValue for &i64 {
    fn into_param_value(self) -> ParamValue {
        ParamValue::I64(*self)
    }
}
impl IntoParamValue for &i32 {
    fn into_param_value(self) -> ParamValue {
        ParamValue::I32(*self)
    }
}
impl IntoParamValue for &f64 {
    fn into_param_value(self) -> ParamValue {
        ParamValue::F64(*self)
    }
}
impl IntoParamValue for &bool {
    fn into_param_value(self) -> ParamValue {
        ParamValue::Bool(*self)
    }
}

pub fn into_param_value<T: IntoParamValue>(v: T) -> ParamValue {
    v.into_param_value()
}

#[macro_export]
macro_rules! params {
    () => {
        $crate::db::Params::empty()
    };
    ($($v:expr),* $(,)?) => {
        $crate::db::Params::from_values(vec![$( $crate::db::into_param_value(&$v) ),*])
    };
}

pub trait ToParams {
    fn to_params(self) -> Params;
}

impl ToParams for Params {
    fn to_params(self) -> Params {
        self
    }
}

impl ToParams for [(); 0] {
    fn to_params(self) -> Params {
        Params::empty()
    }
}

macro_rules! impl_to_params_array {
    ($($n:expr),* $(,)?) => {
        $(
            impl<T: IntoParamValue + Copy> ToParams for [T; $n] {
                fn to_params(self) -> Params {
                    Params::from_values(self.map(|v| v.into_param_value()).to_vec())
                }
            }
        )*
    };
}

impl_to_params_array!(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16);

impl ToParams for Vec<ParamValue> {
    fn to_params(self) -> Params {
        Params::from_values(self)
    }
}

impl ToParams for &[ParamValue] {
    fn to_params(self) -> Params {
        Params::from_values(self.to_vec())
    }
}

impl ToParams for &Vec<ParamValue> {
    fn to_params(self) -> Params {
        Params::from_values(self.clone())
    }
}

impl IntoParamValue for &&str {
    fn into_param_value(self) -> ParamValue {
        ParamValue::Text((*self).to_string())
    }
}

impl IntoParamValue for &&&str {
    fn into_param_value(self) -> ParamValue {
        ParamValue::Text((**self).to_string())
    }
}

impl IntoParamValue for &&String {
    fn into_param_value(self) -> ParamValue {
        ParamValue::Text((*self).clone())
    }
}

impl IntoParamValue for &&i64 {
    fn into_param_value(self) -> ParamValue {
        ParamValue::I64(**self)
    }
}

impl IntoParamValue for &&i32 {
    fn into_param_value(self) -> ParamValue {
        ParamValue::I32(**self)
    }
}

impl IntoParamValue for &Option<i64> {
    fn into_param_value(self) -> ParamValue {
        match self {
            Some(v) => ParamValue::I64(*v),
            None => ParamValue::Null,
        }
    }
}

impl IntoParamValue for &Option<i32> {
    fn into_param_value(self) -> ParamValue {
        match self {
            Some(v) => ParamValue::I32(*v),
            None => ParamValue::Null,
        }
    }
}

impl IntoParamValue for &Option<f64> {
    fn into_param_value(self) -> ParamValue {
        match self {
            Some(v) => ParamValue::F64(*v),
            None => ParamValue::Null,
        }
    }
}

#[cfg(test)]
mod postgres_bind_tests {
    use super::{into_param_value, ParamValue};
    use postgres::types::{IsNull, ToSql, Type};

    fn serialize(value: ParamValue, pg_type: &Type) -> Result<IsNull, String> {
        let boxed = value.as_postgres_box();
        let mut out = bytes::BytesMut::new();
        boxed
            .to_sql_checked(pg_type, &mut out)
            .map_err(|e| e.to_string())
    }

    #[test]
    fn i32_zero_binds_to_smallint() {
        assert!(serialize(into_param_value(0i32), &Type::INT2).is_ok());
    }

    #[test]
    fn naive_date_binds_to_date() {
        let date = chrono::NaiveDate::from_ymd_opt(2026, 7, 9).unwrap();
        assert!(serialize(into_param_value(date), &Type::DATE).is_ok());
    }

    #[test]
    fn timestamp_text_binds_to_timestamp() {
        assert!(serialize(into_param_value("2026-07-09 12:30:00"), &Type::TIMESTAMP).is_ok());
    }

    #[test]
    fn timestamp_text_binds_to_text_column() {
        assert!(serialize(into_param_value("2026-07-09 12:30:00"), &Type::TEXT).is_ok());
    }

    #[test]
    fn date_text_binds_to_date() {
        assert!(serialize(into_param_value("2026-07-09"), &Type::DATE).is_ok());
    }

    #[test]
    fn date_text_binds_to_text_column() {
        assert!(serialize(into_param_value("2026-07-09"), &Type::TEXT).is_ok());
    }

    #[test]
    fn naive_datetime_binds_to_timestamp() {
        let now = chrono::Utc::now().naive_utc();
        assert!(serialize(into_param_value(now), &Type::TIMESTAMP).is_ok());
    }

    #[test]
    fn i64_id_binds_to_int4() {
        assert!(serialize(into_param_value(1i64), &Type::INT4).is_ok());
    }

    #[test]
    fn null_binds_to_text_and_int() {
        assert!(serialize(ParamValue::Null, &Type::TEXT).is_ok());
        assert!(serialize(ParamValue::Null, &Type::INT4).is_ok());
    }
}
