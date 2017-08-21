import { parse as urlParse } from 'url';

function _getGraphQLEndpoint(graphqlEndpoint: string) {
  if ( !graphqlEndpoint.startsWith('/') ) {
    throw new Error('GraphQL Endpoint must start with /');
  }

  const parsed = urlParse(Meteor.absoluteUrl());
  return `ws://${parsed.host}${graphqlEndpoint}`;
}

function _getGraphiQLEndpoint(graphiqlEndpoint: string) {
  if ( !graphiqlEndpoint.startsWith('/') ) {
    throw new Error('GraphiQL Endpoint must start with /');
  }

  const parsed = urlParse(Meteor.absoluteUrl());
  return `${parsed.protocol}//${parsed.host}${graphiqlEndpoint}`;
}

function getSetting(key: string, defaultVal: string) {
  return (Meteor &&
         Meteor.settings &&
         Meteor.settings['meteor-graphql-rxjs'] &&
         Meteor.settings['meteor-graphql-rxjs'][key]) ||
         defaultVal;
}

export function getGraphQLEndpointShort() {
  return getSetting("graphqlEndpoint", "/graphql");
}

export function getGraphiQLEndpointShort() {
  return getSetting("graphiqlEndpoint", "/graphiql");
}

export function getGraphQLEndpoint() {
  return _getGraphQLEndpoint(getGraphQLEndpointShort());
}

export function getGraphiQLEndpoint() {
  return _getGraphiQLEndpoint(getGraphiQLEndpointShort());
}
