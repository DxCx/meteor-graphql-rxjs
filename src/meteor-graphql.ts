import {
  executeRx,
  subscribeRx,
  specifiedRules,
  getOperationAST,
  prepareSchema,
  GraphQLSchema,
  DocumentNode,
  GraphQLFieldResolver,
  AsyncGeneratorFromObserver,
  ExecutionResult,
} from 'graphql-rxjs';
import { addMeteorExtentions } from './meteor-graphql-ext';
import { getPackage } from './packages';

import { Observable } from './observable';

export { GraphQLSchema, specifiedRules };
export function executeMeteor(
  schema: GraphQLSchema,
  document: DocumentNode,
  rootValue?: any,
  contextValue?: any,
  variableValues?: {[key: string]: any},
  operationName?: string,
  fieldResolver?: GraphQLFieldResolver<any, any>,
) {
  return meteorWrapper(document, operationName, contextValue, (ctx) => executeRx(
    schema,
    document,
    rootValue,
    ctx,
    variableValues,
    operationName,
    fieldResolver,
  ));
}

export function subscribeMeteor(
  schema: GraphQLSchema,
  document: DocumentNode,
  rootValue?: any,
  contextValue?: any,
  variableValues?: {[key: string]: any},
  operationName?: string,
  fieldResolver?: GraphQLFieldResolver<any, any>,
  subscribeFieldResolver?: GraphQLFieldResolver<any, any>
) {
  return meteorWrapper(document, operationName, contextValue, (ctx) => subscribeRx(
    schema,
    document,
    rootValue,
    ctx,
    variableValues,
    operationName,
    fieldResolver,
  ));
}

export function meteorPrepareSchema(schema: GraphQLSchema): GraphQLSchema {
  const uSchema = addMeteorExtentions(schema);

  addSessionToResolvers(uSchema);
  prepareSchema(uSchema);
  return uSchema;
}

// This will attach meteor session for GraphQL Context.
// the session will then be binded to resolvers in addSessionToResolvers
export function createMeteorContext(createContext, payload, connectionContext) {
  try {
    return Promise.all([
      createContext(payload),
      createSession(connectionContext.socket, payload.session || undefined),
    ]).then(([userContext, session]) => ({
      userContext,
      session,
      Fiber: getFibers(),
      DDPCommon: getDDPCommon(),
    }));
  } catch (e) {
    return Promise.reject(e);
  }
}
function getFibers() {
  return getPackage('fibers');
}
function getDDPCommon() {
  return getPackage('ddp-common').DDPCommon;
}

function createSession(originalSocket, session?: string) {
  const server = Meteor['server'];
  const Fiber = getFibers();
  const DDPCommon = getDDPCommon();

  if ( session && server.sessions.hasOwnProperty(session) ) {
    return Promise.resolve(server.sessions[session]);
  }

  // Need to create new session, using fake ddp connection.
  return new Promise((resolve, reject) => {
    const version = "1";
    let sessionObject;
    let gqlClosed = false;

    const socket = {
      setWebsocketTimeout: (timeoutValue) => {},
      _meteorSession: undefined,
      headers: { ...originalSocket.upgradeReq.headers },
      send(rawMsg) {
        const msg = DDPCommon.parseDDP(rawMsg);
        switch ( msg.msg ) {
          case 'connected':
            session = msg.session;
            return;
          case 'failed':
            reject(new Error('Failed Creating DDP Session'));
            return;

          // skip minimongo tracking messages.
          case 'added':
          case 'changed':
          case 'removed':
          case 'ready':
          case 'addedBefore':
          case 'movedBefore':
            return;

          default:
            // TODO: Cleanup
            console.log('unexpected send', msg);
            break;
        }
      },
      close() {
        if ( !gqlClosed ) {
          originalSocket.close();
        }
      },
    };

    sessionObject = Fiber(function () {
      server._handleConnect.call(server, socket, {
        version,
        support: [version],
        session,
      });

      return socket._meteorSession;
    }).run();

    // Internal connection does not need heartbeat
    sessionObject.heartbeat.stop();
    sessionObject.heartbeat = null;

    // Internal connection does not need universal subscriptions.
    sessionObject._universalSubs = sessionObject._universalSubs.filter((sub) => {
      sub._deactivate();
      return false;
    });

    originalSocket.on('close', () => {
      gqlClosed = true;

      Fiber(function () {
        sessionObject.close();
      }).run();
    });

    resolve(sessionObject);
  });
}

function invokeByOperation(
  DDPCommon,
  operation: 'query' | 'subscription' | 'mutation',
  session: any,
  fn: (self: any) => void,
): void {
  // TODO: Need to truely understand different between MethodInvocation & Subscription.
  // Subscription is internal so i cannot really use it. :\
  const self = new DDPCommon.MethodInvocation({
    isSimulation: false,
    userId: session.userId,
    setUserId: (id) => session._setUserId(id),
    unblock: () => {},
    connection: session.connectionHandle,
    randomSeed: null,
  });
  Object.assign(self, {
    _session: session,
  });

  switch ( operation ) {
    case 'mutation':
      // call is allowed only for mutations.
      Object.assign(self, {
        call(methodName, ...args) {
          const handlers = session.server.method_handlers;
          if ( !handlers.hasOwnProperty(methodName) ) {
            return Promise.reject(new Meteor.Error(404, `Method named '${methodName}' was not found`));
          }

          return new Promise((resolve, reject) => {
            try {
              resolve(handlers[methodName].call(this, ...args));
            } catch (e) {
              reject(e);
            }
          });
        },
      });
      break;

    case 'query':
    case 'subscription':
      Object.assign(self, {
        call(methodName, ...args) {
          return Promise.reject(new Meteor.Error(403, 'Call is allowed only for mutations'));
        },
      });
      break;
  };

  fn(self);
}

function meteorWrapper(
  document: DocumentNode,
  operationName: string,
  context: any,
  fn: (ctx: any) => Observable<ExecutionResult>,
) {
  const session = context.session;
  const operation = getOperationAST(document, operationName).operation;

  return AsyncGeneratorFromObserver((observer) => {
    let subscription;
    let cancelled = false;

    context.Fiber(function() {
      if ( ! cancelled ) {
        invokeByOperation(context.DDPCommon, operation, session, (self) => {
          subscription = fn({
            userContext: context.userContext,
            self,
          }).distinctUntilChanged().subscribe(observer);
        });
      }
    }).run();

    return () => {
      cancelled = true;

      if ( subscription ) {
        subscription.unsubscribe();
        subscription = null;
      }
    };
  });
}

function addSessionToResolvers(schema): void {
  const resolveWithSession = (resolver: (root, args, ctx, info) => any) => {
    return (root, args, ctx, info) => {
      return resolver.call(ctx.self, root, args, ctx.userContext, info);
    };
  }

  Object.keys(schema.getTypeMap()).forEach((typeName) => {
    const type = schema.getType(typeName);

    if ( typeof type.getFields !== 'function' ) {
      return;
    }

    const fields = type.getFields();
    Object.keys(fields).forEach((fieldName) => {
      if ( fields[fieldName].resolve ) {
        fields[fieldName].resolve = resolveWithSession(fields[fieldName].resolve);
      }

      if ( fields[fieldName].subscribe ) {
        fields[fieldName].subscribe = resolveWithSession(fields[fieldName].subscribe);
      }
    });
  });
}
