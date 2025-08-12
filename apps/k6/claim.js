import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 500 },
    { duration: '20s', target: 2000 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'],
  },
};

export default function () {
  const offerId = __ENV.OFFER_ID || 'offer_1';
  const res = http.post(`http://localhost:4000/offers/${offerId}/accept`, null, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { 'status 200': (r) => r.status === 201 || r.status === 200 });
  sleep(1);
}

