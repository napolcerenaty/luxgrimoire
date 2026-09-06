import { parsePagination, buildPageMeta } from './pagination';

describe('parsePagination', () => {
  it('defaults to page 1 / size 20', () => {
    expect(parsePagination({})).toEqual({ skip: 0, take: 20, page: 1, pageSize: 20 });
  });

  it('computes skip from page and size', () => {
    expect(parsePagination({ page: 3, pageSize: 10 })).toEqual({ skip: 20, take: 10, page: 3, pageSize: 10 });
  });

  it('clamps page to a minimum of 1', () => {
    expect(parsePagination({ page: 0 }).page).toBe(1);
    expect(parsePagination({ page: -5 }).page).toBe(1);
  });

  it('clamps pageSize into the 1..100 range', () => {
    expect(parsePagination({ pageSize: 1000 }).pageSize).toBe(100);
    expect(parsePagination({ pageSize: 0 }).pageSize).toBe(1);
  });
});

describe('buildPageMeta', () => {
  it('derives totalPages with a ceiling division', () => {
    expect(buildPageMeta(45, 2, 20)).toEqual({ total: 45, page: 2, pageSize: 20, totalPages: 3 });
  });

  it('reports 0 pages for an empty result set', () => {
    expect(buildPageMeta(0, 1, 20).totalPages).toBe(0);
  });
});
