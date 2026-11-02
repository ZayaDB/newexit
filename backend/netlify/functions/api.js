// Runs the Express API as a Netlify Function.
// Requests to /api/* are rewritten here by netlify.toml.
const serverless = require('serverless-http');
const { connectLambda } = require('@netlify/blobs');
const app = require('../../src/app');

const FUNCTION_PREFIX = '/.netlify/functions/api';

const handler = serverless(
  (req, res) => {
    // Called directly as /.netlify/functions/api/... -> treat as /api/...
    if (req.url.startsWith(FUNCTION_PREFIX)) {
      req.url = '/api' + req.url.slice(FUNCTION_PREFIX.length);
    }
    return app(req, res);
  },
  { binary: ['image/*'] } // send photos as binary, not text
);

module.exports.handler = async (event, context) => {
  // Reuse the DB pool between invocations instead of waiting for it to drain.
  context.callbackWaitsForEmptyEventLoop = false;
  // Product photos are stored in Netlify Blobs when running on Netlify.
  if (event.blobs) {
    connectLambda(event);
    process.env.NEWEXIT_IMAGE_STORE = 'blobs';
  }
  return handler(event, context);
};
