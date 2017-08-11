// TODO: Eventually a package.

import { SubscriptionServer } from 'subscriptions-transport-ws';
import {
  GraphQLSchema,
  meteorPrepareSchema,
  executeMeteor,
  subscribeMeteor,
  specifiedRules,
  createMeteorContext,
} from './meteor-graphql';
import {
  graphiqlMeteor
} from './meteor-graphiql';

import { parse as urlParse } from 'url';
import { Observable } from './observable';

// Meteor Imports
import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';

let SERVER_RUNNING = false;

export interface GraphQLServerOptions {
  schema: GraphQLSchema;
  createContext?: (initPayload: any) => { [key: string]: any };
  quiet?: boolean;
  graphiql?: boolean;
  graphiqlQuery?: string;
  graphqlEndpoint?: string;
  graphiqlEndpoint?: string;
}

export interface GraphQLServerRuntime {
  server: SubscriptionServer;
  graphqlUrl: string;
  graphiqlUrl?: string;
}

function meteorLog(...args) {
  // TODO: How to properly log to meteor?
  return (console.log as any)(...args);
}

function startServer(
  {
    schema,
    quiet = false,
    graphqlEndpoint = '/graphql',
    graphiqlEndpoint = '/graphiql',
    graphiql = false,
    graphiqlQuery = '',
    createContext = () => ({}),
  }: GraphQLServerOptions
) : Observable<any> {
  let graphqlUrl;
  let graphiqlUrl;

  try {
    if ( !Meteor.isServer ) {
      throw new Error('GraphQL Server can run only on Meteor Server');
    }

    if ( SERVER_RUNNING ) {
      throw new Error('An existing instance of Meteor GraphQL Server is running, please stop it first');
    }

    if ( !graphqlEndpoint.startsWith('/') ) {
      throw new Error('GraphQL Endpoint must start with /');
    }

    if ( !graphiqlEndpoint.startsWith('/') ) {
      throw new Error('GraphiQL Endpoint must start with /');
    }

    const parsed = urlParse(Meteor.absoluteUrl());

    graphqlUrl = `ws://${parsed.host}${graphqlEndpoint}`;
    if ( graphiql ) {
      graphiqlUrl = `${parsed.protocol}//${parsed.host}${graphiqlEndpoint}`;
    }

    schema = meteorPrepareSchema(schema);
  } catch ( e ) {
    return Observable.throw(e);
  }

  return Observable.create((observer) => {
    const subscriptionServer = SubscriptionServer.create(
      {
        schema,
        execute: executeMeteor,
        subscribe: subscribeMeteor,
        validationRules: specifiedRules,
        // Deafult KA is 10seconds
        keepAlive: 9500,
        onConnect: (payload, _, connectionContext) =>
          createMeteorContext(createContext, payload, connectionContext),
      },
      {
        server: WebApp.httpServer,
        path: graphqlEndpoint,
      }
    );

    if ( graphiql ) {
      WebApp.connectHandlers.use(graphiqlEndpoint, graphiqlMeteor({
        endpointURL: graphqlUrl,
        query: graphiqlQuery,
      }));
    }

    const closeHandler = () => {
      if ( !quiet ) {
        meteorLog('Websocket Server Closed');
      }

      SERVER_RUNNING = false;
      observer.complete();
    };
    WebApp.httpServer.on('close', closeHandler);

    SERVER_RUNNING = true;

    observer.next({
      server: subscriptionServer,
      graphqlUrl,
      graphiqlUrl,
    });

    if ( !quiet ) {
      meteorLog(`Websocket Server is now running on ${graphqlUrl}`);
      if ( graphiqlUrl ) {
        meteorLog(`Websocket GraphiQL Server is now running ${graphiqlUrl}`);
      }
    }

    return () => {
      throw new Error('Unsubscribe not supported at the moment');

      // WebApp.httpServer.removeListener('close', closeHandler);

      // if ( graphiql ) {
      //   WebApp.connectHandlers.stack = WebApp.connectHandlers.stack.filter
      //     ((routeInfo) => routeInfo.route !== graphiqlEndpoint);
      // }

      // TODO: no way of stopping server.
      // subscriptionServer.close();

      // TODO: Until we can really cleanup server, we cannot change state.
      // SERVER_RUNNING = false;
    };
  });
}

export function runGraphQLServer(options: GraphQLServerOptions): Observable<GraphQLServerRuntime> {
  return startServer(options);
}
