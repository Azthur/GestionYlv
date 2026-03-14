document.addEventListener('DOMContentLoaded', () => {
    
    // Check if already logged in
    const token = localStorage.getItem('yelave_token');
    if (token) {
        window.location.href = 'index.html';
    }

    const loginForm = document.getElementById('loginForm');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');

    // Toggle password visibility
    togglePasswordBtn.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        const icon = togglePasswordBtn.querySelector('i');
        if (type === 'text') {
            icon.classList.remove('ri-eye-line');
            icon.classList.add('ri-eye-off-line');
        } else {
            icon.classList.remove('ri-eye-off-line');
            icon.classList.add('ri-eye-line');
        }
    });

    const showError = (message) => {
        errorText.textContent = message;
        errorMessage.style.display = 'flex';
        // Shake animation roughly
        loginForm.animate([
            { transform: 'translateX(0)' },
            { transform: 'translateX(-5px)' },
            { transform: 'translateX(5px)' },
            { transform: 'translateX(-5px)' },
            { transform: 'translateX(5px)' },
            { transform: 'translateX(0)' }
        ], { duration: 400 });
    };

    const hideError = () => {
        errorMessage.style.display = 'none';
    };

    const setLoading = (loading) => {
        submitBtn.disabled = loading;
        if (loading) {
            btnText.style.display = 'none';
            btnLoader.style.display = 'inline-block';
        } else {
            btnText.style.display = 'inline-block';
            btnLoader.style.display = 'none';
        }
    };

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();
        setLoading(true);

        const username = document.getElementById('username').value.trim();
        const password = passwordInput.value;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Usuario o contraseña incorrectos.');
            }

            // Success
            localStorage.setItem('yelave_token', data.access_token);
            localStorage.setItem('yelave_user', JSON.stringify(data.user));
            
            // Redirect to dashboard
            window.location.href = 'index.html';

        } catch (error) {
            console.error('Login error:', error);
            showError(error.message || 'Error de conexión. Intente nuevamente.');
        } finally {
            setLoading(false);
        }
    });
});
