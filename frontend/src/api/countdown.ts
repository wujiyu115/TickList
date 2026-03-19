import api from './index';
import { Countdown, CountdownCreateRequest, CountdownUpdateRequest } from '../types';

export const getCountdowns = async (params?: {
  category?: string;
  skip?: number;
  limit?: number;
}): Promise<{ countdowns: Countdown[]; total: number }> => {
  return api.get('/countdowns', { params });
};

export const getCountdown = async (id: string): Promise<Countdown> => {
  return api.get(`/countdowns/${id}`);
};

export const createCountdown = async (data: CountdownCreateRequest): Promise<Countdown> => {
  return api.post('/countdowns', data);
};

export const updateCountdown = async (id: string, data: CountdownUpdateRequest): Promise<Countdown> => {
  return api.put(`/countdowns/${id}`, data);
};

export const deleteCountdown = async (id: string): Promise<void> => {
  return api.delete(`/countdowns/${id}`);
};
