import { Inngest } from 'inngest';

// Central Inngest client used across the app
// Make sure to set INNGEST_APP_ID in your environment for clear identification in Inngest Cloud
export const inngest = new Inngest({ id: process.env.INNGEST_APP_ID || 'synqforge-stripe' });


