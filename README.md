meteor-graphql-rxjs
==
GraphQL-RxJS Integration package for Meteor

This package is used along with [meteor-rxjs](https://www.npmjs.com/package/meteor-rxjs) to enable reactive graphql
experiance for meteor.

#### Quick Start
  - Mongo Collections:

    Mongo Collections needs to be initialized using `meteor-rxjs` wrapper,
    this way `Collection.find` will return an RxJs Observable:
        
    ```typescript     
    import { MongoObservable } from 'meteor-rxjs';

    export interface Message {
      from: String
      content: String
    }

    export const Messages = new MongoObservable.Collection<Message>('messages');
    ```
  - Schema:
  
    GraphQL-RxJS adds `Observable` support for graphql resolvers,
    also, resolvers are running under meteor invocation.
    
    ```typescript
    import { makeExecutableSchema } from 'graphql-tools';
    
    export const schema = makeExecutableSchema({
      typeDefs: `
      type Message {
        content: String
      }
      
      type Query {
        allMessages: [Message]
      }
      
      type Mutation {
        addMessage(content: String!): Boolean
      }
      `,
      resolvers: {
        Query: {
          allMessages: (root, args, ctx) => {
          	return ctx.Messages.find({});
          },
        },
        Mutation: {
          addMessage: (root, args, ctx) => {
            if ( !this.userId ) {
              throw new Error('Not logged in');
            }
              
            ctx.Messages.collection.insert({
              from: this.userId,
              content: args.content,
            });
            
            return true;
          },
        },
      },
    });
    ```
        
  - Server Side:
      
    Server side needs to be initialized by just providing a schema and a context:
    
    ```typescript
    import { runGraphQLServer } from 'meteor-graphql-rxjs';
    import { schema } from './schema';
    import { Messages } from './collections/messages';

    Meteor.startup(() => {
      const sub = runGraphQLServer(Npm.require, {
        schema,
        createContext: (payload) => ({
          Messages,
        }),
      })
      .subscribe(undefined, (error) => {
          console.error('GraphQL Server Failed:', error);
      });
    });
    ```
    
    at this point, you should have 2 new endpoints in your graphql server:
      - `/graphql` - websocket graphql endpoint.
      - `/graphiql` - GraphiQL Interface connected to that endpoint. (Only if `graphiql` option = true)
  - Client Side:

	Client can just import a connected network interface:
    
    ```typescript
    import { getNetworkInterface } from 'meteor-graphql-rxjs';
    
    const networkInterface = getNetworkInterface();
    // ...
    // you can now use this networkInterface to send graphql requests,
    // or provide it for apollo client for example.
    ```

#### API
  - Client:
    - `function getNetworkInterface(params?: ClientOptions): SubscriptionsClient` - This function will return a
    connected network interface that you can just send requests through or pass to apollo-client for example.
      - `params` -> optional extra params for `SubscriptionsClient`
  - Server:
    - `runGraphQLServer(mRequire: MeteorRequire, options: GraphQLServerOptions): Observable<GraphQLServerRuntime>` - This function will return an Observable. subscribing on this observable will start the server.
      - `mRequire` -> Meteor's `Npm.Require` function.
      - `options` -> actual server options:
        - `schema` -> Required Parameter with GraphQLSchema to execute.
        - `createContext: (initPayload: any)` -> Optional callback to provide context per session.
	  initPayload will contain connection `connect` payload.
        - `quiet` -> Optional boolean to disable info prints.
        - `graphiql` -> Optional boolean to enable graphiql.
        - `graphiqlQuery` -> Optional string containing default document for GraphiQL.

#### Settings
this package works with [Meteor's settings](https://themeteorchef.com/tutorials/making-use-of-settings-json)
all you need to do is add `meteor-graphql-rxjs` key, for example:
```json
{
  "meteor-graphql-rxjs": {
  	"graphqlEndpoint": "/graphql",
  	"graphiqlEndpoint": "/graphiql"
  }
}
```

Available options:
  - `graphqlEndpoint`: path for graphql websocket endpoint
  - `graphiqlEndpoint`: path for graphiql interface (incase `graphiql` = true)

#### Resolver's Context
resolvers will be executed under Meteor's invocation, which means you can use:
  1. `this.userId` => Same as this.userId inside any other invocation.
  2. `this.call(methodName, ...args)` => invoke Meteor method and return promise for the result.
  3. `this.userId$` => Observable with userId, for example:
  
  ```typescript
  import { makeExecutableSchema } from 'graphql-tools';
    
  export const schema = makeExecutableSchema({
      typeDefs: `
      type Message {
        content: String
      }
      
      type Query {
        myMessage: [Message]
      }
      `,
      resolvers: {
        Query: {
          myMessage: (root, args, ctx) => {
            return this.userId$.switchMap((userId) => {
              if ( !userId ) {
                return Observable.of(null);
              }
              return ctx.Messages.find({ from: userId });
            });
          },
        },
      },
    });
  ```

#### Extentions
This package also bring extentions with it,
the extentions should connect between Meteor's world into GraphQL's.

at the moment there is only basic functionality,
but we can extend in the future:
  - Accounts (`accounts-base`):
    - Extends Schema:
    ```graphql
    type Mutation {
        loginWithToken(token: String!): ID!
        logout: ID
    }
    ```
    - AutoLogin when Meteor login, auto log out when Meteor logs out.
    - AutoLogin GraphiQL as well.

#### Example Repository
**TODO**

#### Contribution
Contributions, issues and feature requests are very welcome. If you are using this package and fixed a bug for yourself, please consider submitting a PR!
