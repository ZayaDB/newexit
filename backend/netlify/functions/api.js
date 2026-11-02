// Runs the Express API as a Netlify Function.
// Requests to /api/* are rewritten here by netlify.toml.
const serverless = require('serverless-http');
const app = require('../../src/app');

const FUNCTION_PREFIX = '/.netlify/functions/api';

const handler = serverless((req, res) => {
  // Called directly as /.netlify/functions/api/... -> treat as /api/...
  if (req.url.startsWith(FUNCTION_PREFIX)) {
    req.url = '/api' + req.url.slice(FUNCTION_PREFIX.length);
  }
  return app(req, res);
});

module.exports.handler = async (event, context) => {
  // Reuse the DB pool between invocations instead of waiting for it to drain.
  context.callbackWaitsForEmptyEventLoop = false;
  return handler(event, context);
};
