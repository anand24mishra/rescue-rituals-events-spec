import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) limit: number;
  @ApiProperty({ example: 42, description: 'Total matching records.' })
  total: number;
  @ApiProperty({ example: 3 }) totalPages: number;
}

/**
 * Every collection response uses this `{ data, meta }` shape so a client can
 * write one pagination helper rather than one per endpoint.
 */
export class PaginatedDto<T> {
  data: T[];
  meta: PaginationMetaDto;
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedDto<T> {
  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}
