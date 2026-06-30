#[derive(Clone)]
pub enum ParamValue {
    Null,
    I64(i64),
    I32(i32),
    F64(f64),
    Bool(bool),
    Text(String),
    Blob(Vec<u8>),
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
        }
    }

    fn as_postgres_box(&self) -> Box<dyn postgres::types::ToSql + Sync + Send> {
        match self {
            ParamValue::Null => {
                let n: Option<i32> = None;
                Box::new(n)
            }
            ParamValue::I64(v) => Box::new(*v),
            ParamValue::I32(v) => Box::new(*v),
            ParamValue::F64(v) => Box::new(*v),
            ParamValue::Bool(v) => Box::new(*v),
            ParamValue::Text(v) => Box::new(v.clone()),
            ParamValue::Blob(v) => Box::new(v.clone()),
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
