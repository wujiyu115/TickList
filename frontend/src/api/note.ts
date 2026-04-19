import api from './index';
import {
  NoteFolder,
  NoteFolderCreateRequest,
  NoteFolderUpdateRequest,
  Note,
  NoteCreateRequest,
  NoteUpdateRequest,
} from '../types';

// ========== 文件夹 API ==========

export const getNoteFolders = async (params?: {
  parent_id?: string;
  skip?: number;
  limit?: number;
}): Promise<{ folders: NoteFolder[]; total: number }> => {
  return api.get('/note-folders', { params });
};

export const createNoteFolder = async (data: NoteFolderCreateRequest): Promise<NoteFolder> => {
  return api.post('/note-folders', data);
};

export const updateNoteFolder = async (id: string, data: NoteFolderUpdateRequest): Promise<NoteFolder> => {
  return api.put(`/note-folders/${id}`, data);
};

export const deleteNoteFolder = async (id: string): Promise<void> => {
  return api.delete(`/note-folders/${id}`);
};

export const reorderNoteFolders = async (items: Array<{ id: string; order: number }>): Promise<void> => {
  return api.post('/note-folders/reorder', items);
};

// ========== 笔记 API ==========

export const getNotes = async (params?: {
  folder_id?: string;
  skip?: number;
  limit?: number;
}): Promise<{ notes: Note[]; total: number }> => {
  return api.get('/notes', { params });
};

export const getNote = async (id: string): Promise<Note> => {
  return api.get(`/notes/${id}`);
};

export const createNote = async (data: NoteCreateRequest): Promise<Note> => {
  return api.post('/notes', data);
};

export const updateNote = async (id: string, data: NoteUpdateRequest): Promise<Note> => {
  return api.put(`/notes/${id}`, data);
};

export const deleteNote = async (id: string): Promise<void> => {
  return api.delete(`/notes/${id}`);
};

export const moveNote = async (id: string, folderId: string | null): Promise<Note> => {
  return api.put(`/notes/${id}/move`, { folder_id: folderId });
};

export const reorderNotes = async (items: Array<{ id: string; order: number }>): Promise<void> => {
  return api.post('/notes/reorder', items);
};
