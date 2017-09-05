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
import {
  getScehmaSubscriptions,
  getScehmaResolvers,
  makeExecutableSchema,
} from 'graphql-schema-tools';
import { SubscriptionClient } from 'subscriptions-transport-ws';
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
  subscriptions?: {
    [fieldName: string]: GraphQLFieldResolver<any, any>,
  },
};

export function addMeteorExtentions(schema: GraphQLSchema): GraphQLSchema {
  const extentions = getMeteorExtentions(schema);
  const originalResolvers = getScehmaResolvers(schema);
  const originalSubscriptions = getScehmaSubscriptions(schema);
  const originalSchema = printSchema(schema);
  const finalSchema = {
    typeDefs: [ originalSchema, ...extentions.typeDefs ],
    resolvers: [ originalResolvers, ...extentions.resolvers ],
    subscriptions: [ originalSubscriptions, ...extentions.subscriptions ],
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
    .reduce((res, ext) => ({
      typeDefs: [ ...res.typeDefs, ext.typeDefs ],
      resolvers: [ ...res.resolvers, ext.resolvers ],
      subscriptions: [ ...res.subscriptions, ext.subscriptions || {} ],
    }), {
      typeDefs: [],
      resolvers: [],
      subscriptions: [],
    });
}
