/* Every page, by the first part of its URL (#/<key>/...). */
import home from './home.js';
import { about, terms, privacy, contact } from './info.js';
import { login, signup, verify, forgot, reset } from './auth.js';
import dashboard from './dashboard.js';
import { jobs, workers } from './browse.js';
import job from './job.js';
import post from './post.js';
import profile from './profile.js';
import settings from './settings.js';
import payments from './payments.js';
import notifications from './notifications.js';
import messages from './messages.js';

export const pages = { '': home, about, terms, privacy, contact, login, signup, verify, forgot, reset, dashboard, jobs, workers, job, post, profile, settings, payments, notifications, messages };
