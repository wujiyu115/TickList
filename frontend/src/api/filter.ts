import api from './index';
import { Filter, FilterConditions } from '../types';

export const getFilters = (): Promise<{ filters: Filter[]; total: number }> => 
  api.get('/filters');

export const createFilter = (data: { name: string; conditions: FilterConditions }): Promise<Filter> => 
  api.post('/filters', data);

export const updateFilter = (filterId: string, data: { name?: string; conditions?: FilterConditions }): Promise<Filter> => 
  api.put(`/filters/${filterId}`, data);

export const deleteFilter = (filterId: string): Promise<{ message: string }> => 
  api.delete(`/filters/${filterId}`);
