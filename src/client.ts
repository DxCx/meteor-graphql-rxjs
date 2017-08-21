import { getGraphQLEndpoint } from './common';
import { initClient } from './meteor-graphql-ext';
import { SubscriptionClient, ClientOptions } from 'subscriptions-transport-ws';

export function getNetworkInterface(params?: ClientOptions): SubscriptionClient {
  if ( !Meteor.isClient ) {
    throw new Error('GraphQL NetworkInterface can run only on Meteor Client');
  }
  const givenParams = params || {};
  // force link connection.
  givenParams.reconnect = true;

  const networkIface = new SubscriptionClient(getGraphQLEndpoint(), givenParams);
  initClient(networkIface);
  return networkIface;
}
