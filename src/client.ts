import { getGraphQLEndpoint } from './common';
import { SubscriptionClient, ClientOptions } from 'subscriptions-transport-ws';

export function getNetworkInterface(params?: ClientOptions): SubscriptionClient {
  if ( !Meteor.isClient ) {
    throw new Error('GraphQL NetworkInterface can run only on Meteor Client');
  }

  return new SubscriptionClient(getGraphQLEndpoint(), params);
}
