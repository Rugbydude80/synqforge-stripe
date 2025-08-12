import { Inngest } from 'inngest';
import './jobs/expandRadiusIfUnfilled.js';
import './jobs/closeExpiredOffers.js';
import './jobs/tipsRequestSLAWatcher.js';

export const inngest = new Inngest({ name: 'Rota Workers' });

