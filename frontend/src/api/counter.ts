import api from './index';
import { Counter, CounterCreateRequest, CounterUpdateRequest, CounterHistory } from '../types';

export const getCounters = async (params?: {
  skip?: number;
  limit?: number;
}): Promise<{ counters: Counter[]; total: number }> => {
  return api.get('/counters', { params });
};

export const getCounter = async (id: string): Promise<Counter> => {
  return api.get(`/counters/${id}`);
};

export const createCounter = async (data: CounterCreateRequest): Promise<Counter> => {
  return api.post('/counters', data);
};

export const updateCounter = async (id: string, data: CounterUpdateRequest): Promise<Counter> => {
  return api.put(`/counters/${id}`, data);
};

export const deleteCounter = async (id: string): Promise<void> => {
  return api.delete(`/counters/${id}`);
};

export const incrementCounter = async (id: string): Promise<Counter & { reached_target: boolean }> => {
  return api.post(`/counters/${id}/increment`);
};

export const decrementCounter = async (id: string): Promise<Counter & { reached_target: boolean }> => {
  return api.post(`/counters/${id}/decrement`);
};

export const completeCounter = async (id: string): Promise<Counter> => {
  return api.put(`/counters/${id}/complete`);
};

export const reopenCounter = async (id: string): Promise<Counter> => {
  return api.put(`/counters/${id}/reopen`);
};

export const getCounterHistories = async (id: string, params?: {
  skip?: number;
  limit?: number;
}): Promise<{ histories: CounterHistory[]; total: number }> => {
  return api.get(`/counters/${id}/histories`, { params });
};
