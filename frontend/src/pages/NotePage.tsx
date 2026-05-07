import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Empty,
  Input,
  Button,
  Select,
  Popconfirm,
  message,
  Space,
  Tooltip,
} from 'antd';
import {
  PushpinOutlined,
  PushpinFilled,
  DeleteOutlined,
  TagOutlined,
} from '@ant-design/icons';
import Cherry from 'cherry-markdown';
import 'cherry-markdown/dist/cherry-markdown.css';
import { Note, NoteFolder, Tag } from '../types';
import { getNote, updateNote, deleteNote } from '../api/note';
import { getNoteFolders } from '../api/note';
import { getTags } from '../api/tag';
import './NotePage.less';

const NotePage: React.FC = () => {
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(false);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<string | undefined>('');

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const note_id = searchParams.get('note_id');

  // Cherry Markdown 实例与容器
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const cherryRef = useRef<Cherry | null>(null);
  // 标记是否由 Cherry 内部触发的 content 变更（避免循环更新）
  const isInternalChangeRef = useRef(false);

  // 自动保存防抖定时器
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 获取笔记详情
  const fetchNote = useCallback(async () => {
    if (!note_id) return;

    setLoading(true);
    try {
      const noteData = await getNote(note_id);
      setNote(noteData);
      setTitle(noteData.title);
      setContent(noteData.content);
      setSelectedTags(noteData.tags || []);
    } catch (error) {
      console.error('Failed to fetch note:', error);
      message.error('获取笔记失败');
    } finally {
      setLoading(false);
    }
  }, [note_id]);

  // 获取文件夹列表
  const fetchFolders = useCallback(async () => {
    try {
      const response = await getNoteFolders();
      setFolders(response.folders);
    } catch (error) {
      console.error('Failed to fetch folders:', error);
    }
  }, []);

  // 获取标签列表
  const fetchTags = useCallback(async () => {
    try {
      const response = await getTags();
      setTags(response.tags || []);
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    }
  }, []);

  useEffect(() => {
    fetchNote();
    fetchFolders();
    fetchTags();
  }, [fetchNote, fetchFolders, fetchTags]);

  // 初始化 Cherry Markdown 编辑器
  useEffect(() => {
    if (!editorContainerRef.current || !note) return;

    // 如果已有实例则先销毁
    if (cherryRef.current) {
      cherryRef.current.destroy();
      cherryRef.current = null;
    }


    const cherry = new Cherry({
      el: editorContainerRef.current,
      value: content || '',
      editor: {
        defaultModel: 'edit&preview',
      },
      toolbars: {
        toolbar: [
          'bold', 'italic', 'strikethrough', '|',
          'header', 'list', 'checklist', '|',
          'quote', 'code', 'table', '|',
          'link', 'image', 'hr', '|',
          'togglePreview', 'switchModel',
        ],
      },
      engine: {
        syntax: {
          table: {
            enableChart: false,
          },
        },
      },
      externals: {
        echarts: false
      },
      callback: {
        afterChange: (markdownContent: string) => {
          isInternalChangeRef.current = true;
          setContent(markdownContent);
        },
      },
    });

    cherryRef.current = cherry;

    return () => {
      cherry.destroy();
      cherryRef.current = null;
    };
    // 仅在 note 切换时重新初始化编辑器
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  // 自动保存
  const autoSave = useCallback(() => {
    if (!note) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await updateNote(note.id, {
          title,
          content: content || '',
        });
      } catch (error) {
        console.error('Failed to auto save note:', error);
        message.error('自动保存失败');
      }
    }, 1000);
  }, [note, title, content]);

  useEffect(() => {
    if (note) {
      autoSave();
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [note, title, content, autoSave]);

  // 切换置顶
  const handleTogglePin = async () => {
    if (!note) return;
    try {
      await updateNote(note.id, { is_pinned: !note.is_pinned });
      message.success(note.is_pinned ? '已取消置顶' : '已置顶');
      fetchNote();
    } catch (error) {
      console.error('Failed to toggle pin:', error);
      message.error('操作失败');
    }
  };

  // 标签变更
  const handleTagsChange = async (tagIds: string[]) => {
    if (!note) return;
    try {
      setSelectedTags(tagIds);
      await updateNote(note.id, { tags: tagIds });
      window.dispatchEvent(new CustomEvent('notes-refreshed'));
    } catch (error) {
      console.error('Failed to update tags:', error);
      message.error('更新标签失败');
    }
  };

  // 移动到文件夹
  const handleMoveToFolder = async (folderId: string | null) => {
    if (!note) return;
    try {
      await updateNote(note.id, { folder_id: folderId });
      message.success('移动成功');
      fetchNote();
      window.dispatchEvent(new CustomEvent('notes-refreshed'));
    } catch (error) {
      console.error('Failed to move note:', error);
      message.error('移动失败');
    }
  };

  // 删除笔记
  const handleDelete = async () => {
    if (!note) return;
    try {
      await deleteNote(note.id);
      message.success('删除成功');
      navigate('/notes');
    } catch (error) {
      console.error('Failed to delete note:', error);
      message.error('删除失败');
    }
  };

  if (!note_id || !note) {
    return (
      <div className="note-page">
        <Card className="note-container">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="请选择一个笔记或创建新笔记"
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="note-page">
      <Card className="note-container" loading={loading}>
        {/* 顶部工具栏 */}
        <div className="note-toolbar">
          <Space size="middle">
            <Tooltip title={note.is_pinned ? '取消置顶' : '置顶'}>
              <Button
                type="text"
                icon={note.is_pinned ? <PushpinFilled /> : <PushpinOutlined />}
                onClick={handleTogglePin}
                className={note.is_pinned ? 'pin-active' : ''}
              />
            </Tooltip>

            <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>标签</span>
            <Select
              mode="multiple"
              value={selectedTags}
              onChange={handleTagsChange}
              placeholder="添加标签"
              style={{ minWidth: 150 }}
              options={tags.map(tag => ({ value: tag.id, label: tag.name }))}
              tagRender={(props) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 4px' }}>
                  <TagOutlined style={{ fontSize: 12, color: tags.find(t => t.id === props.value)?.color }} />
                  {props.label}
                </span>
              )}
            />

            <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>文件夹</span>
            <Select
              value={note.folder_id}
              onChange={handleMoveToFolder}
              placeholder="移动到文件夹"
              style={{ width: 150 }}
              allowClear
            >
              {folders.map((folder) => (
                <Option key={folder.id} value={folder.id}>
                  {folder.name}
                </Option>
              ))}
            </Select>

            <Popconfirm
              title="确定删除这个笔记吗？"
              onConfirm={handleDelete}
              okText="确定"
              cancelText="取消"
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        </div>

        {/* 标题输入框 */}
        <div className="note-title-wrapper">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入笔记标题"
            className="note-title-input"
            bordered={false}
            maxLength={100}
          />
        </div>

        {/* Markdown 编辑器 */}
        <div className="note-editor-wrapper">
          <div ref={editorContainerRef} className="cherry-editor-container" />
        </div>
      </Card>
    </div>
  );
};

export default NotePage;