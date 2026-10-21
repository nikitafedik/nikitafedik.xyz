import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';

// One entry per paper, newest first. Titles, authors and venues are small HTML strings (sub/sup, <b>, <i>).
const publications = defineCollection({
  loader: file('src/data/publications.json'),
  schema: z.object({
    n: z.number().int(),
    year: z.number().int(),
    title: z.string(),
    authors: z.string(),
    venue: z.string(),
    link: z.object({ label: z.string(), url: z.string().url() }).nullable(),
    // a plain note after the venue, e.g. "vip article - top 10%"
    note: z.string().nullable(),
    // journal covers; own = cover art designed by Nikita, image = file stem in public/img/covers
    cover: z.object({ label: z.string(), own: z.boolean(), image: z.string().nullable() }).nullable(),
    // spinning molecule under the number (keys in public/mol.js)
    molecule: z.enum(['cdse', 'azobenzene', 'benzene', 'naphthalene', 'sbin', 'pdsnbi', 'nabh3']).nullable(),
  }),
});

export const collections = { publications };
