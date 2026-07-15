use postgres::{Client, NoTls};

fn main() {
    let mut client = Client::connect("postgres://hrm:hrm@127.0.0.1:5433/hrm", NoTls).unwrap();
    for row in client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'assets'", &[]).unwrap() {
        let name: String = row.get(0);
        let dtype: String = row.get(1);
        println!("{}: {}", name, dtype);
    }
}
