const db = require('../config/database');
const logger = require('../config/logger');

function audit(action, entityType, entityId = null, details = null) {
  return async (req, res, next) => {
    try {
      await db('admin_audit_logs').insert({
        admin_id: req.auth?.sub || null, action, entity_type: entityType,
        entity_id: entityId === null ? null : String(entityId),
        details: details ? JSON.stringify(details) : null,
        ip_address: req.ip
      });
    } catch (error) {
      logger.error({ err: error, action, entityType }, 'Failed to persist admin audit log');
    }
    return next();
  };
}

module.exports = { audit };
