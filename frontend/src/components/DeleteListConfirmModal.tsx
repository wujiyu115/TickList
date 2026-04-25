import React, { useState, useEffect } from 'react';
import { Modal, Radio, Select, Space, message } from 'antd';
import { TaskList } from '../types';
import { deleteList, getListTaskCount } from '../api/list';

interface DeleteListConfirmModalProps {
  visible: boolean;
  item: TaskList | null;
  lists: TaskList[];
  onCancel: () => void;
  onSuccess: () => void;
}

const DeleteListConfirmModal: React.FC<DeleteListConfirmModalProps> = ({
  visible,
  item,
  lists,
  onCancel,
  onSuccess,
}) => {
  const [action, setAction] = useState<'delete_tasks' | 'move_tasks'>('delete_tasks');
  const [targetListId, setTargetListId] = useState<string | undefined>(undefined);
  const [taskCount, setTaskCount] = useState<number>(0);
  const [sublistCount, setSublistCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const isFolder = item?.type === 'folder';

  useEffect(() => {
    if (visible && item) {
      getListTaskCount(item.id).then(data => {
        setTaskCount(data.task_count);
        if (data.type === 'folder') {
          setSublistCount(data.sublist_count || 0);
        }
      }).catch(() => {
        setTaskCount(0);
        setSublistCount(0);
      });
    }
    if (visible) {
      setAction('delete_tasks');
      setTargetListId(undefined);
    }
  }, [visible, item]);

  const availableLists = lists.filter(l => {
    if (!item) return true;
    if (l.id === item.id) return false;
    if (isFolder && l.parent_id === item.id) return false;
    return l.type === 'list';
  });

  const handleOk = async () => {
    if (!item) return;
    setLoading(true);
    try {
      const params: { action?: string; target_list_id?: string } = {};
      if (taskCount > 0) {
        params.action = action;
        if (action === 'move_tasks' && targetListId) {
          params.target_list_id = targetListId;
        }
      }
      const result = await deleteList(item.id, params);
      if (taskCount > 0 && action === 'delete_tasks') {
        message.success(`已删除清单和 ${result.deleted_tasks} 个任务`);
      } else if (taskCount > 0 && action === 'move_tasks') {
        message.success(`已删除清单，${result.moved_tasks} 个任务已移动`);
      } else {
        message.success(isFolder ? '文件夹已删除' : '清单已删除');
      }
      onSuccess();
    } catch (e: any) {
      const detail = e.response?.data?.detail;
      if (detail) {
        message.error(detail);
      } else {
        message.error('删除失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => isFolder ? `删除文件夹「${item?.name}」` : `删除清单「${item?.name}」`;

  if (taskCount === 0) {
    return (
      <Modal
        title={getTitle()}
        open={visible}
        okText="删除"
        okType="danger"
        cancelText="取消"
        confirmLoading={loading}
        onOk={handleOk}
        onCancel={onCancel}
      >
        <p>确定删除{isFolder ? '文件夹' : '清单'}「{item?.name}」吗？</p>
      </Modal>
    );
  }

  const getContentText = () => {
    if (isFolder && sublistCount > 0) {
      return `该文件夹下有 ${sublistCount} 个清单，共 ${taskCount} 个任务，请选择处理方式`;
    }
    return `该清单下有 ${taskCount} 个任务，请选择处理方式`;
  };

  return (
    <Modal
      title={getTitle()}
      open={visible}
      okText="确认"
      cancelText="取消"
      confirmLoading={loading}
      onOk={handleOk}
      onCancel={onCancel}
      width={460}
    >
      <p>{getContentText()}</p>
      <Radio.Group
        value={action}
        onChange={e => setAction(e.target.value)}
        style={{ marginTop: 16 }}
      >
        <Space direction="vertical">
          <Radio value="delete_tasks">清除所有任务</Radio>
          <Radio value="move_tasks">
            移动任务到其他清单
            {action === 'move_tasks' && (
              <Select
                value={targetListId}
                onChange={setTargetListId}
                style={{ width: 200, marginLeft: 8 }}
                placeholder="选择目标清单"
              >
                <Select.Option value="">收集箱</Select.Option>
                {availableLists.map(l => (
                  <Select.Option key={l.id} value={l.id}>{l.name}</Select.Option>
                ))}
              </Select>
            )}
          </Radio>
        </Space>
      </Radio.Group>
    </Modal>
  );
};

export default DeleteListConfirmModal;