import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Empty,
  Input,
  Button,
  Modal,
  message,
  Dropdown,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  PushpinOutlined,
  PushpinFilled,
  DeleteOutlined,
  TagOutlined,
  FolderOutlined,
  MoreOutlined,
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

  // 删除笔记（带 Modal 确认）
  const handleDeleteConfirm = () => {
    Modal.confirm({
      title: '确定删除这个笔记吗？',
      okText: '确定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!note) return;
        try {
          await deleteNote(note.id);
          message.success('删除成功');
          navigate('/notes');
        } catch (error) {
          console.error('Failed to delete note:', error);
          message.error('删除失败');
        }
      },
    });
  };

  // 构建「更多」下拉菜单
  const moreMenuItems: MenuProps['items'] = [
    {
      key: 'pin',
      icon: note?.is_pinned ? <PushpinFilled /> : <PushpinOutlined />,
      label: note?.is_pinned ? '取消置顶' : '置顶',
      onClick: handleTogglePin,
    },
    {
      key: 'tags',
      icon: <TagOutlined />,
      label: '标签',
      children: tags.map((tag) => ({
        key: `tag-${tag.id}`,
        label: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: tag.color || '#d9d9d9',
                flexShrink: 0,
              }}
            />
            {tag.name}
            {selectedTags.includes(tag.id) && ' ✓'}
          </span>
        ),
        onClick: () => {
          const newTags = selectedTags.includes(tag.id)
            ? selectedTags.filter((id) => id !== tag.id)
            : [...selectedTags, tag.id];
          handleTagsChange(newTags);
        },
      })),
    },
    {
      key: 'folder',
      icon: <FolderOutlined />,
      label: '移动到文件夹',
      children: [
        {
          key: 'folder-none',
          label: '不归属文件夹',
          onClick: () => handleMoveToFolder(null),
        },
        ...folders.map((folder) => ({
          key: `folder-${folder.id}`,
          label: (
            <span>
              {folder.name}
              {note?.folder_id === folder.id && ' ✓'}
            </span>
          ),
          onClick: () => handleMoveToFolder(folder.id),
        })),
      ],
    },
    { type: 'divider' as const },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      danger: true,
      onClick: handleDeleteConfirm,
    },
  ];

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
        {/* 标题行：标题 + 更多按钮 */}
        <div className="note-title-wrapper">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入笔记标题"
            className="note-title-input"
            bordered={false}
            maxLength={100}
          />
          <Dropdown menu={{ items: moreMenuItems }} trigger={['click']} placement="bottomRight">
            <Button type="text" icon={<MoreOutlined style={{ fontSize: 18 }} />} className="note-more-btn" />
          </Dropdown>
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