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
} from '@ant-design/icons';
import { Editor } from '@bytemd/react';
import gfm from '@bytemd/plugin-gfm';
import highlight from '@bytemd/plugin-highlight';
import breaks from '@bytemd/plugin-breaks';
import 'bytemd/dist/index.css';
import { Note, NoteFolder } from '../types';
import { getNote, updateNote, deleteNote } from '../api/note';
import { getNoteFolders } from '../api/note';
import './NotePage.less';

const { Option } = Select;

// 预设颜色
const PRESET_COLORS = [
  '#1890ff',
  '#52c41a',
  '#faad14',
  '#f5222d',
  '#722ed1',
  '#eb2f96',
  '#13c2c2',
  '#fa8c16',
  '#8c8c8c',
];

const bytemdPlugins = [gfm(), highlight(), breaks()];

const NotePage: React.FC = () => {
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(false);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<string | undefined>('');
  const [selectedColor, setSelectedColor] = useState('');
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const note_id = searchParams.get('note_id');
  
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
      setSelectedColor(noteData.color);
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

  useEffect(() => {
    fetchNote();
    fetchFolders();
  }, [fetchNote, fetchFolders]);

  // 自动保存
  const autoSave = useCallback(() => {
    if (!note) return;

    // 清除之前的定时器
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // 设置新的定时器，1秒后保存
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await updateNote(note.id, {
          title,
          content: content || '',
        });
        // 不显示保存成功消息，避免干扰用户
      } catch (error) {
        console.error('Failed to auto save note:', error);
        message.error('自动保存失败');
      }
    }, 1000);
  }, [note, title, content]);

  // 监听标题和内容变化，触发自动保存
  useEffect(() => {
    if (note) {
      autoSave();
    }
    
    // 清理定时器
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

  // 切换颜色
  const handleColorChange = async (color: string) => {
    if (!note) return;
    
    try {
      setSelectedColor(color);
      await updateNote(note.id, { color });
      fetchNote();
    } catch (error) {
      console.error('Failed to update color:', error);
      message.error('更新颜色失败');
    }
  };

  // 移动到文件夹
  const handleMoveToFolder = async (folderId: string | null) => {
    if (!note) return;
    
    try {
      await updateNote(note.id, { folder_id: folderId });
      message.success('移动成功');
      fetchNote();
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

  // 无笔记选中时显示空状态
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

            <Tooltip title="选择颜色">
              <div className="color-picker">
                {PRESET_COLORS.map((color) => (
                  <div
                    key={color}
                    className={`color-option ${selectedColor === color ? 'selected' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleColorChange(color)}
                  />
                ))}
              </div>
            </Tooltip>

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
          <Editor
            value={content || ''}
            plugins={bytemdPlugins}
            onChange={(val) => setContent(val)}
          />
        </div>
      </Card>
    </div>
  );
};

export default NotePage;
