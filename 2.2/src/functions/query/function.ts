import { app } from '@azure/functions';

import { queryHttpTrigger } from './handler';

app.http('query', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'api/query',
  handler: queryHttpTrigger,
});
