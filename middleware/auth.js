// Auth guards and ownership checks.
// Use in routers: const { requireAuth, requireAdmin, canManage } = require('../middleware/auth');

// protects route for logged-in users (is logged in or not)
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// protects route for admin users only (isAdmin or not)
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.isAdmin) {
    return res.redirect('/login');
  }
  next();
}

// checks if the logged-in user can manage a given car (admin or owner)
function canManage(car, req) {
  return req.session.user?.isAdmin || car.user_id === req.session.user?.id;
}

// export the middleware functions to be used in other files
module.exports = {
  requireAuth,
  requireAdmin,
  canManage,
};