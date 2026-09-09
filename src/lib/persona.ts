import type { Persona } from '../types';
import { PERSONAS } from '../../shared/constants';

export function personaById(id: string): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}
