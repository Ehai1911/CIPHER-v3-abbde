// Netlify wrapper для margo-ads
import handler from '../../api/margo-ads.js';

export default async (req, context) => {
  const body = await req.json();
  const mockRes = {
    _status: 200, _body: null,
    status(code) { this._status = code; return this; },
    json(data) { this._body = data; return this; }
  };
  await handler({ method: req.method, body }, mockRes);
  return new Response(JSON.stringify(mockRes._body), {
    status: mockRes._status,
    headers: { 'Content-Type': 'application/json' }
  });
};
