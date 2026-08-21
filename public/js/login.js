// Live Clock script (Philippine Standard Time UTC+8 / Asia/Manila)
        function updateClock() {
            try {
                const now = new Date();
                
                // Format date in Manila timezone
                const dateOptions = {
                    timeZone: 'Asia/Manila',
                    month: 'long',
                    day: '2-digit',
                    year: 'numeric'
                };
                const dateStr = now.toLocaleDateString('en-US', dateOptions);
                
                // Format time in Manila timezone (military / 24-hour style)
                const timeOptions = {
                    timeZone: 'Asia/Manila',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                };
                let timeStr = now.toLocaleTimeString('en-US', timeOptions);
                
                // Clean up non-numeric letters (e.g. AM/PM check)
                timeStr = timeStr.replace(/\s*[a-zA-Z]+/g, '');
                
                // Update elements
                document.getElementById('date-display').textContent = dateStr;
                document.getElementById('time-display').textContent = timeStr;
            } catch (e) {
                console.error("Error updating Philippine Time: ", e);
            }
        }

        updateClock();
        setInterval(updateClock, 1000);

        // Show/Hide Password Script
        const passwordInput = document.getElementById('password');
        const toggleBtn = document.getElementById('toggle-password-btn');
        const toggleIcon = document.getElementById('toggle-password-icon');

        toggleBtn.addEventListener('click', function() {
            const isShowing = passwordInput.type === 'text';
            passwordInput.type = isShowing ? 'password' : 'text';
            toggleIcon.src = isShowing ? 'img/eye.png' : 'img/eye-off-sharp.png';
            toggleBtn.setAttribute('aria-label', isShowing ? 'Show password' : 'Hide password');
            toggleBtn.setAttribute('aria-pressed', String(!isShowing));
        });

        // Form Submit & Toast Notification Script
        const loginForm = document.getElementById('login-form');
        loginForm.addEventListener('submit', function(event) {
            event.preventDefault();

            const btn = loginForm.querySelector('.login-btn');
            const usernameVal = document.getElementById('username').value.trim();
            const passwordVal = document.getElementById('password').value;

            // Set loading state
            btn.disabled = true;
            btn.textContent = 'LOGGING IN…';
            btn.setAttribute('aria-busy', 'true');

            setTimeout(function() {
                const isValid = (usernameVal === 'admin' && passwordVal === 'admin');

                if (!isValid) {
                    // Restore button
                    btn.disabled = false;
                    btn.textContent = 'LOGIN';
                    btn.removeAttribute('aria-busy');

                    // Show inline error
                    let errEl = document.getElementById('login-error');
                    if (!errEl) {
                        errEl = document.createElement('p');
                        errEl.id = 'login-error';
                        errEl.setAttribute('role', 'alert');
                        loginForm.insertBefore(errEl, btn);
                    }
                    errEl.textContent = 'Invalid username or password. Please try again.';

                    // Clear and focus password
                    const passField = document.getElementById('password');
                    passField.value = '';
                    passField.focus();
                    return;
                }

                // Success
                const existingErr = document.getElementById('login-error');
                if (existingErr) existingErr.remove();

                showToast('Login Successful! Redirecting…', 'login', function() {
                    window.location.href = 'windowList.html';
                });
            }, 400);
        });

        function showToast(message, type, callback) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerHTML = `<span>${message}</span><div class="toast-progress"></div>`;
            container.appendChild(toast);

            // Trigger animation
            setTimeout(() => {
                toast.classList.add('show');
            }, 50);

            // Hide and execute callback
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => {
                    toast.remove();
                    if (callback) callback();
                }, 350);
            }, 1500);
        }