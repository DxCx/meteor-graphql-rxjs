import * as GraphiQL from 'apollo-server-module-graphiql';
import * as url from 'url';
import { extendGraphiql } from './meteor-graphql-ext';

function patchGraphiQL(graphiqlString: string) {
  return graphiqlString + `<script>${extendGraphiql()}</script>`;
}

export function graphiqlMeteor(options: GraphiQL.GraphiQLData) {
  return (req, res, next) => {
    const query = req.url && url.parse(req.url, true).query;
    GraphiQL.resolveGraphiQLString(query, options, req).then(graphiqlString => {
      res.setHeader('Content-Type', 'text/html');
      res.write(patchGraphiQL(graphiqlString));
      res.end();
    }, error => next(error));
  };
}
