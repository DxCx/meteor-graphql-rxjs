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
        myMessage: [Message]
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
      
    Server side needs to be initialized by just providing a schema:
    
    ```typescript
    import { runGraphQLServer } from 'meteor-graphql-rxjs';
    import { schema } from './schema';
    import { Messages } from './collections/messages';

    Meteor.startup(() => {
      const sub = runGraphQLServer(Npm.require, {
        schema,
        graphiql: true,
        graphiqlQuery: defaultQuery,
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
      - `/graphiql` - GraphiQL Interface connected to that endpoint.
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
**TODO**

#### Resolver's Context
**TODO**
userId$

#### Settings
**TODO**
settings.json

#### Extentions
  - Accounts
  
**TODO**

#### Example Repository
**TODO**

#### Contribution
Contributions, issues and feature requests are very welcome. If you are using this package and fixed a bug for yourself, please consider submitting a PR!
