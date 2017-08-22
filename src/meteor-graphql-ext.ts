// Extentions for meteor graphql.
// hopefully we can make that also some kind of infastructure in the future.
import {
  printSchema,
  Kind,
  print,
  parse,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLFieldResolver,
} from 'graphql';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import { makeExecutableSchema } from 'graphql-tools';
import { recursive as merge } from 'merge';
import { getPackage } from './packages';

export interface MeteorExtentionRootTypesInfo {
  query: string,
  mutation: string,
  subscription: string,
};

export interface MeteorExtentionConfig {
  typeDefs: string;
  resolvers: {
    [typeName: string]: {
      [fieldName: string]: GraphQLFieldResolver<any, any>,
    },
  },
};

export function addMeteorExtentions(schema: GraphQLSchema): GraphQLSchema {
  const extentions = getMeteorExtentions(schema);
  const originalResolvers = getScehmaResolvers(schema);
  const originalSchema = printSchema(schema);
  const finalSchema = {
    typeDefs: [ originalSchema, ...extentions.typeDefs ],
    resolvers: merge(true, originalResolvers, extentions.resolvers),
  };

  return makeExecutableSchema(finalSchema);
}

export function extendGraphiql() {
  return EXTENTIONS.map((ext) => ext.extendGraphiql())
    .filter((v) => !!v)
    .join('\n');
}

export function initClient(networkInterface: SubscriptionClient) {
  EXTENTIONS.forEach((ext) => ext.initClient(networkInterface));
}

function getRootType(defaultName: string, type?: GraphQLObjectType): string {
  const typeName = type && type.name;
  return typeName || defaultName;
}

function MeteorAccountsLogin(TokenName: string, networkInterface: SubscriptionClient, observer) {
  if ( !localStorage ) {
    return;
  }

  var oldToken = localStorage.getItem(TokenName);
  if ( !oldToken ) {
    return;
  }

  networkInterface.request({
    query: `mutation login($token: String!) {
    loginWithToken(token: $token)
    }`,
    variables: {
      token: oldToken,
    },
    operationName: 'login',
  }).subscribe(observer);
}

const MeteorAccountsExtention = {
  initClient(networkInterface: SubscriptionClient) {
    const AccountsPkg = getPackage('accounts-base');
    if ( ! AccountsPkg ) {
      return null;
    }

    const Accounts = AccountsPkg.Accounts;
    const nullObserver = {
      next: () => {},
      error: (e) => console.error(e),
      complete: () => {},
    };

    if ( Accounts.userId() ) {
      MeteorAccountsLogin(Accounts.LOGIN_TOKEN_KEY, networkInterface, nullObserver);
    }

    Accounts.onLogin(function() {
      MeteorAccountsLogin(Accounts.LOGIN_TOKEN_KEY, networkInterface, nullObserver);
    });

    Accounts.onLogout(function() {
      networkInterface.request({
        query: `mutation logout {
          logout
        }`,
        operationName: 'logout',
      }).subscribe(nullObserver);
    });
  },
  extendSchema(
    rootTypes: MeteorExtentionRootTypesInfo,
  ): MeteorExtentionConfig | null {

    if ( ! getPackage('accounts-base') ) {
      return null;
    }

    const mutation = rootTypes.mutation;
    return {
      typeDefs: `type ${mutation} {
        loginWithToken(token: String!): ID!
        logout: ID
      }`,
      resolvers: {
        [mutation]: {
          loginWithToken(root, args, ctx) {
            return this.call('login', { resume: args.token })
              .then((v) => v.id);
          },
          logout(root, args, ctx) {
            return this.call('logout')
              .then(() => null);
          }
        },
      },
    };
  },
  extendGraphiql() {
    if ( ! getPackage('accounts-base') ) {
      return null;
    }

    return `
      (function AutoLogin() {
        if ( !localStorage ) {
          return;
        }

        var oldToken = localStorage.getItem('Meteor.loginToken');
        if ( !oldToken ) {
          return;
        }

        fetcher({
          query: 'mutation login($token: String!) {' +
                 '  loginWithToken(token: $token)' +
                 '}',
          variables: {
            token: oldToken,
          },
          operationName: 'login',
        }).subscribe();
      })();`;
  },
}

function extendTypes(
  schema: GraphQLSchema,
  extentionConfig: MeteorExtentionConfig,
): MeteorExtentionConfig {
  const EXTEND = "extend ";
  const parsedExt = parse(extentionConfig.typeDefs);

  parsedExt.definitions = parsedExt.definitions.map((typeDef) => {
      if ( typeDef.kind !== Kind.OBJECT_TYPE_DEFINITION ) {
        return typeDef;
      }

      if ( !schema.getType(typeDef.name.value) ) {
        return typeDef;
      }

      const newStart = typeDef.loc.start;
      const newEnd = typeDef.loc.end + EXTEND.length;
      typeDef.loc.start = EXTEND.length;
      typeDef.loc.end = newEnd;

      return {
        kind: Kind.TYPE_EXTENSION_DEFINITION,
        definition: typeDef,
        loc: {
          start: newStart,
          end: newEnd,
        },
      } as any;
    });

  return {
    typeDefs: print(parsedExt),
    resolvers: extentionConfig.resolvers,
  };
}

const EXTENTIONS = [
  MeteorAccountsExtention,
];

function getMeteorExtentions(
  schema: GraphQLSchema,
) {

  const rootTypes: MeteorExtentionRootTypesInfo = {
    query: getRootType('Query', schema.getQueryType()),
    mutation: getRootType('Mutation', schema.getMutationType()),
    subscription: getRootType('Subscription', schema.getSubscriptionType()),
  };

  return EXTENTIONS
    .map((ext) => ext.extendSchema(rootTypes))
    .filter((extConf) => !!extConf)
    .map((ext) => extendTypes(schema, ext))
    .reduce((res, ext) => {
      return {
        typeDefs: [ ...res.typeDefs, ext.typeDefs ],
        resolvers: merge(true, res.resolvers, ext.resolvers),
      };
    }, {
      typeDefs: [],
      resolvers: {},
    });
}

// get schema Resolvers, might be nice to open a PR for graphql-tools.
function getScehmaResolvers(schema: GraphQLSchema): ({
  [typeName: string]: { [fieldName: string]: GraphQLFieldResolver<any, any> }
}) {
  return Object.keys(schema.getTypeMap()).reduce((types, typeName) => {
    // Skip internal types.
    if ( typeName.startsWith('__') ) {
      return types;
    }

    // TODO: solve better typing issue if this is working.
    const type: any = schema.getType(typeName);

    if ( typeof type.getFields !== 'function' ) {
      return types;
    }

    const fields = type.getFields();
    const fieldResolvers = Object.keys(fields).reduce((resolvers, fieldName) => {
      if ( undefined === fields[fieldName].resolve ) {
        return resolvers;
      }

      return {
        ...(resolvers || {}),
        [fieldName]: fields[fieldName].resolve,
      };
    }, undefined);

    if ( !fieldResolvers ) {
      return types;
    }

    return {
      ...types,
      [typeName]: fieldResolvers,
    };
  }, {});
}

