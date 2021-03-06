import { Resolver, Query, Mutation, Args } from '@nestjs/graphql'
import { InputCreateUsersDto } from './dto/input-users.dto'
import { UsersEntity } from './entity/users.entity'
import { UsersService } from './service/users.service'
import { JwtService } from '@nestjs/jwt'
import { UseGuards } from '@nestjs/common'
import { GqlAuthGuard } from 'src/auth/gql-auth.guard'
import { User } from 'src/auth/auth.decorator'
import { Role } from 'src/auth/role.enum'
import { Roles } from 'src/auth/roles.decorator'
import { RolesGuard } from 'src/auth/roles.guard'
import * as bcrypt from 'bcrypt'
import { TokenService } from './service/token.service'
import { TokensDto } from './dto/token.dto'

@Resolver('Users')
export class UsersResolver {
  constructor(
    private readonly usersService: UsersService,
    private jwtService: JwtService,
    private tokenService: TokenService,
  ) {}

  @UseGuards(GqlAuthGuard)
  @Query((returns) => UsersEntity)
  async getUsers(
    @User() user: UsersEntity,
    @Args('email')
    email: string,
  ): Promise<UsersEntity> {
    return this.usersService.findUserByEmail(email)
  }

  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Query((returns) => UsersEntity)
  async getUsersFromAdmin(
    @User() user: UsersEntity,
    @Args('email')
    email: string,
  ): Promise<UsersEntity> {
    return this.usersService.findUserByEmail(email)
  }

  @Mutation((returns) => UsersEntity)
  async createUser(
    @Args('input') input: InputCreateUsersDto,
  ): Promise<UsersEntity> {
    return this.usersService.insertUser(input)
  }

  @Mutation((returns) => TokensDto)
  async login(
    @Args('email') email: string,
    @Args('password') password: string,
  ): Promise<TokensDto> {
    const user = await this.usersService.findUserByEmail(email)
    const isMatch = await bcrypt.compare(password, user.password)
    const payload = { userId: user.id, sub: user.id }
    const refreshToken = await this.tokenService.generateRefreshToken(
      user,
      60 * 60 * 24 * 30,
    )
    if (isMatch) {
      return {
        userId: user.id,
        accessToken: this.jwtService.sign(payload),
        refreshToken,
        tokenType: 'Bearer',
        expireIn: 300,
      }
    }
    throw new Error('Email or Password incorrect')
  }

  @Mutation((returns) => TokensDto)
  async refreshToken(@Args('token') token: string): Promise<TokensDto> {
    try {
      const resultToken = await this.tokenService.findTokenByRefreshToken(token)
      if (!resultToken.isRevoked) {
        await this.tokenService.revokedTokenById(resultToken.id)
        const user = await this.usersService.findUserById(resultToken.userId)
        const payload = { userId: user.id, sub: user.id }
        const refreshToken = await this.tokenService.generateRefreshToken(
          user,
          60 * 60 * 24 * 30,
        )
        return {
          userId: user.id,
          accessToken: this.jwtService.sign(payload),
          refreshToken,
          tokenType: 'Bearer',
          expireIn: 300,
        }
      }
      throw new Error('token does not exits')
    } catch (e) {
      throw new Error('token incorrect')
    }
  }
}
