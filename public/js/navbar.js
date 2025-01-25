document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const navLinks = document.querySelector('.nav-links');

    if (token) {
        navLinks.innerHTML = `
            <button id="logoutBtn">Logout</button>
        `;

        document.getElementById('logoutBtn').addEventListener('click', () => {
            localStorage.removeItem('token');
            window.location.href = '/login';
        });
    } else {
        navLinks.innerHTML = `
            <a href="/login">Login</a>
            <a href="/signup">Sign Up</a>
        `;
    }
});
