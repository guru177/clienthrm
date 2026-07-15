const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOjEsImVtYWlsIjoiaW5mb0ByZXRhaWxkYWRkeS5pbiIsImV4cCI6MTc4NDExOTU3MCwiaWF0IjoxNzg0MDMzMTcwLCJvcmdhbml6YXRpb25faWQiOjEsIm9yZ19zbHVnIjoibWFzaHVwdGVjaCIsImlzX3N1cGVyX2FkbWluIjp0cnVlLCJpc19leHRlcm5hbCI6ZmFsc2UsImF1ZCI6InRlbmFudCIsImltcGVyc29uYXRlZF9ieSI6bnVsbCwiaW1wZXJzb25hdGlvbiI6ZmFsc2V9.MW_1DBQHMtO2LBBR-v-cH02e549_FwWEm2Mip2WPw_Y';

async function run() {
    const res = await fetch('http://127.0.0.1:3001/api/admin/assets', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            name: 'honda test',
            asset_type: 'vehicle',
            identifier: ''
        })
    });
    const text = await res.text();
    console.log(res.status, text);
}

run();
