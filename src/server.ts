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
import {
  getGraphQLEndpoint,
  getGraphQLEndpointShort,
  getGraphiQLEndpoint,
  getGraphiQLEndpointShort,
} from './common';

import { Observable } from './observable';
import { MeteorRequire, getPackage, setRequire } from './packages';
import { parse as urlParse } from 'url';

let SERVER_RUNNING = false;

export interface GraphQLServerOptions {
  schema: GraphQLSchema;
  createContext?: (initPayload: any) => { [key: string]: any };
  quiet?: boolean;
  graphiql?: boolean;
  graphiqlQuery?: string;
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

    graphqlUrl = getGraphQLEndpoint();
    if ( graphiql ) {
      graphiqlUrl = getGraphiQLEndpoint();
    }

    schema = meteorPrepareSchema(schema);
  } catch ( e ) {
    return Observable.throw(e);
  }
  const WebApp = getPackage('webapp').WebApp;

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
        noServer: true,
      }
    );

    // Generate upgrade handler which supports both Meteor socket and graphql.
    const wsServer = subscriptionServer['wsServer'];
    const upgradeHandler = (req, socket, head) => {
      const pathname = urlParse(req.url).pathname;

      if (pathname === getGraphQLEndpointShort()) {
        wsServer.handleUpgrade(req, socket, head, (ws) => {
          wsServer.emit('connection', ws, req);
        });
      } else if ( pathname.startsWith('/sockjs') ) {
        // Don't do anything, this is meteor socket.
      } else {
        socket.close();
      }
    };
    WebApp.httpServer.on('upgrade', upgradeHandler);

    if ( graphiql ) {
      WebApp.connectHandlers.use(getGraphiQLEndpointShort(), graphiqlMeteor({
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
      WebApp.httpServer.removeListener('close', closeHandler);

      if ( graphiql ) {
        WebApp.connectHandlers.stack = WebApp.connectHandlers.stack.filter
          ((routeInfo) => routeInfo.route !== getGraphQLEndpointShort());
      }

      subscriptionServer.close();
      WebApp.httpServer.removeListener('upgrade', upgradeHandler);

      SERVER_RUNNING = false;
    };
  });
}

export function runGraphQLServer(mRequire: MeteorRequire, options: GraphQLServerOptions): Observable<GraphQLServerRuntime> {
  try {
    setRequire(mRequire);
  } catch (e) {
    return Observable.throw(e);
  }

  return startServer(options);
}
