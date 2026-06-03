const axios = require('axios');
async function run() {
    try {
        const res = await axios.get('http://localhost:3001/api/admin/job-applications', {
            // bypassing auth or simulate auth
        });
        console.log(res.data);
    } catch(e) {
        console.log(e.response ? e.response.status : e.message);
    }
}
run();
