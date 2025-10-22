const https = require('http');

const options = {
  hostname: 'localhost',
  port: 9000,
  path: '/api/issues/search?projectKeys=bilateral_bound&issueStatuses=OPEN,CONFIRMED,REOPENED&ps=10',
  method: 'GET'
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      
      
      if (result.issues && result.issues.length > 0) {
        result.issues.forEach((issue, index) => {
          console.log(`${index + 1}. ${issue.rule} - ${issue.message} (${issue.component.split('/').pop()}:${issue.line})`);
        });
      }
    } catch (e) {
      
      console.log('Ответ:', data.slice(0, 500));
    }
  });
});

req.on('error', (err) => {
  console.error('Ошибка:', err.message);
});

req.end();
