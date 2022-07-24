import { makeExecutableSchema } from '@graphql-tools/schema'
import type { GraphQLContext } from './context'
import type { Link } from '@prisma/client'
import { GraphQLYogaError } from '@graphql-yoga/node'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime'

const typeDefinitions = /* GraphQL */ `
  type Query {
    info: String!
    comment(id: ID!): Comment
    link(id: ID): Link
    feed(filterNeedle: String, skip: Int, take: Int): [Link!]!

  }

  type Comment {
    id: ID!
    body: String!
    link: Link
  }

  type Mutation {
    postLink(url: String!, description: String!): Link!
    postCommentOnLink(linkId: ID!, body: String!): Comment!
  }

  type Link {
    id: ID!
    description: String!
    url: String!
    comments: [Comment!]!
  }


`

const parseIntSafe = (value: string): number | null => {
  if (/^(\d+)$/.test(value)) {
    return parseInt(value, 10)
  }
  return null
}

const parseUrlSafe = (value: string): string | null => {
  if (/^https?:\/\/[A-Za-z0-9:.]*([\/]{1}.*\/?)$/.test(value)) {
    return value
  }
  return null
}


const applyTakeConstraints = (params: {
  min: number
  max: number
  value: number
}) => {
  if (params.value < params.min || params.value > params.max) {
    throw new GraphQLYogaError(
      `'take' argument value '${params.value}' is outside the valid range of '${params.min}' to '${params.max}'.`,
    )
  }
  return params.value
}

const applySkipConstraints = (params: {
  min: number
  value: number
}) => {
  if (params.value < params.min) {
    throw new GraphQLYogaError(
      `'skip' argument value '${params.value}' is below the min of '${params.min}'.`,
    )
  }
  return params.value
}

  const resolvers = {
    Query: {
        info: () => `This is the API of a Hackernews Clone`,
        // 3
        feed: async (
          parent: unknown,
          args: { filterNeedle?: string; skip?: number; take?: number },
          context: GraphQLContext,
        ) => {
          const where = args.filterNeedle
          ? {
            OR: [
              { description: { contains: args.filterNeedle } },
              { url: { contains: args.filterNeedle } },
            ],
          }
        : {}
        const take = applyTakeConstraints({
          min: 1,
          max: 50,
          value: args.take ?? 30,
        })
        const skip = applySkipConstraints({
          min: 1,
          value: args.skip ?? 1,
        })
        return context.prisma.link.findMany({
          where,
          skip,
          take,
        })
        },
        comment: async (
          parent: unknown,
          args: { id: string },
          context: GraphQLContext,
        ) => {
          return context.prisma.comment.findUnique({
            where: { id: parseInt(args.id) },
          })
        },
        link: async (
          parent: unknown,
          args: { id: string },
          context: GraphQLContext,
        ) => {
          return context.prisma.link.findUnique({
            where: { id: parseInt(args.id) },
          })
        },
      },
      Link: {
        id: (parent: Link) => parent.id,
        description: (parent: Link) => parent.description,
        url: (parent: Link) => parent.url,
        comments: (parent: Link, args: {}, context: GraphQLContext) => {
          return context.prisma.comment.findMany({
            where: {
              linkId: parent.id,
            },
          })
        },
      },
      Mutation: {
        postLink: async (
          parent: unknown, 
          args: { description: string; 
            url: string },
            context: GraphQLContext,
            ) => {
              const isUrl = parseUrlSafe(args.url)
              if (isUrl == null) {
                return Promise.reject(
                  new GraphQLYogaError(
                    `Cannot post comment on invalid link'${args.url}'.`,
                  ),
                )
              }
          const newLink = await context.prisma.link.create({
            data: {
              url: args.url,
              description: args.description,
            },
          })
          return newLink
        }, 
        postCommentOnLink: async (
          parent: unknown,
          args: { linkId: string; body: string },
          context: GraphQLContext,
        ) => {
          const linkId = parseIntSafe(args.linkId)
          if (linkId === null) {
            return Promise.reject(
              new GraphQLYogaError(
                `Cannot post comment on non-existing link with id '${args.linkId}'.`,
              ),
            )
          }
          if (args.body.length < 1) {
            return Promise.reject(
              new GraphQLYogaError(
                `Please include a comment`,
              ),
            )
          }
          const newComment = await context.prisma.comment.create({
            data: {
              linkId: parseInt(args.linkId),
              body: args.body,
            },
          })
          .catch((err: unknown) => {
            if (
              err instanceof PrismaClientKnownRequestError &&
              err.code === "P2003"
            ) {
              return Promise.reject(
                new GraphQLYogaError(
                  `Cannot post comment on non-existing link with id '${args.linkId}'`
                ),
              )
            }
            return Promise.reject(err)
          })
          return newComment
        },
      },
    }


export const schema = makeExecutableSchema({
  resolvers: [resolvers],
  typeDefs: [typeDefinitions],
})