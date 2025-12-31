// Auth utilities for SelfEval

// Get current user (returns null if not logged in)
async function getCurrentUser() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      return data.user;
    }
    return null;
  } catch (error) {
    console.error('Error checking auth:', error);
    return null;
  }
}

// Require authentication - redirects to signin if not logged in
async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/signin';
    return null;
  }
  return user;
}

// Require admin role
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/signin';
    return null;
  }
  if (user.role !== 'admin') {
    alert('Admin access required');
    window.location.href = '/';
    return null;
  }
  return user;
}

// Logout user
async function logout() {
  try {
    await fetch('/api/auth/signout', { method: 'POST' });
    window.location.href = '/signin';
  } catch (error) {
    console.error('Logout error:', error);
    window.location.href = '/signin';
  }
}

// Update navbar based on auth state
async function updateNavbar(navItemsId = 'nav-items') {
  const navItems = document.getElementById(navItemsId);
  if (!navItems) return;

  const user = await getCurrentUser();

  if (!user) {
    // Not logged in
    navItems.innerHTML = `
      <a class="nav-link" href="/">Courses</a>
      <a class="nav-link" href="/signin">Sign In</a>
      <a class="nav-link" href="/signup">Sign Up</a>
    `;
  } else if (user.role === 'admin') {
    // Admin user
    navItems.innerHTML = `
      <a class="nav-link" href="/">Courses</a>
      <a class="nav-link" href="/manage">Manage</a>
      <a class="nav-link" href="/admin">Users</a>
      <a class="nav-link" href="/profile">${escapeHtml(user.name)}</a>
      <a class="nav-link" href="#" onclick="logout(); return false;">Logout</a>
    `;
  } else {
    // Regular learner
    navItems.innerHTML = `
      <a class="nav-link" href="/">Courses</a>
      <a class="nav-link" href="/profile">${escapeHtml(user.name)}</a>
      <a class="nav-link" href="#" onclick="logout(); return false;">Logout</a>
    `;
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
