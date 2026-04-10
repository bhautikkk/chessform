const templateParams = {
    name: 'Test Name',
    username: 'test_username',
    email: 'hrr26400@gmail.com', // Sending to their own email
    user_email: 'hrr26400@gmail.com',
    phone: '1234567890',
    rating: '1500'
};

const data = {
    service_id: 'service_nfjpyi6',
    template_id: 'template_udal0hk',
    user_id: 'RigOHkJ8jBL9S7079',
    template_params: templateParams
};

fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    },
    body: JSON.stringify(data)
})
.then(async (response) => {
    if (response.ok) {
        console.log('SUCCESS!');
    } else {
        const text = await response.text();
        console.log('FAILED...', response.status, text);
    }
})
.catch(err => console.error('ERROR', err));
