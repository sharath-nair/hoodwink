import type { Question } from './types';

export const QUESTION_BANK: readonly Question[] = [
  { id: 'q-emu', prompt: "In 1932, the Australian military famously lost a 'war' against ___.", realAnswer: 'emus' },
  { id: 'q-pringles', prompt: 'Fredric Baur, who invented the Pringles can, asked for his ashes to be buried in a ___.', realAnswer: 'Pringles can' },
  { id: 'q-wombat', prompt: 'Wombats are the only known animals that produce ___-shaped poop.', realAnswer: 'cube' },
  { id: 'q-flamingo', prompt: 'A group of flamingos is called a ___.', realAnswer: 'flamboyance' },
  { id: 'q-banana', prompt: 'Botanically speaking, a banana is a ___.', realAnswer: 'berry' },
  { id: 'q-cleopatra', prompt: 'Cleopatra lived closer in time to the ___ than to the building of the Great Pyramid of Giza.', realAnswer: 'Moon landing' },
  { id: 'q-honey', prompt: 'Honey found in ancient Egyptian tombs was still ___.', realAnswer: 'edible' },
  { id: 'q-oxford', prompt: 'The University of Oxford is older than the ___ Empire.', realAnswer: 'Aztec' },
  { id: 'q-octopus', prompt: 'An octopus has three ___.', realAnswer: 'hearts' },
  { id: 'q-tittle', prompt: "The dot over a lowercase 'i' is called a ___.", realAnswer: 'tittle' },
  { id: 'q-unicorn', prompt: "Scotland's national animal is the ___.", realAnswer: 'unicorn' },
  { id: 'q-shark', prompt: 'Sharks existed before ___ did.', realAnswer: 'trees' },
];

export const FALLBACK_ANSWERS: readonly string[] = [
  'A really aggressive goose',
  'Nobody knows',
  'My uncle Gary',
  'Tax fraud',
  'Soup, probably',
  'The French',
  'Legally distinct cheese',
  'A vibes-based decision',
  'Static electricity',
  'Whatever Bob said',
];
