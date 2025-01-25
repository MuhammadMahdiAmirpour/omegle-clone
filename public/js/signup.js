document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signupForm');

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);

            const imageFile = formData.get('image');
            const reader = new FileReader();

            reader.onload = async () => {
                try {
                    const response = await fetch('/api/users/signup', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            username: formData.get('username'),
                            email: formData.get('email'),
                            password: formData.get('password'),
                            bio: formData.get('bio'),
                            image: reader.result.split(',')[1]
                        })
                    });

                    const data = await response.json();
                    if (data.token) {
                        localStorage.setItem('token', data.token);
                        window.location.href = '/';
                    } else {
                        console.error('Signup failed:', data.error);
                    }
                } catch (error) {
                    console.error('Signup error:', error);
                }
            };

            reader.readAsDataURL(imageFile);
        });
    }
});
