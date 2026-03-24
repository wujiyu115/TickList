import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, DatePicker, Tag, Space } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useTaskContext } from '../contexts/TaskContext';
import { getLists } from '../api/list';
import { getTags } from '../api/tag';
import { getSettings } from '../api/settings';
import { TaskList, Tag as TagType, UserSettings } from '../types';

const { TextArea } = Input;
const { Option } = Select;

interface TaskCreateModalProps {
  visible: boolean;
  onClose: () => void;
  parentId?: string;
}

const TaskCreateModal: React.FC<TaskCreateModalProps> = ({ visible, onClose, parentId }) => {
  const { addTask } = useTaskContext();
  const [searchParams] = useSearchParams();
  const currentListId = searchParams.get('list_id');
  const currentTag = searchParams.get('tag');
  
  const [form] = Form.useForm();
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 清单和标签数据
  const [lists, setLists] = useState<TaskList[]>([]);
  const [allTags, setAllTags] = useState<TagType[]>([]);
  
  // 用户设置
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  
  // 加载清单、标签和用户设置
  useEffect(() => {
    const loadData = async () => {
      try {
        const [listsRes, tagsRes, settingsRes] = await Promise.all([
          getLists(),
          getTags(),
          getSettings()
        ]);
        setLists(listsRes.lists || []);
        setAllTags(tagsRes.tags || []);
        setUserSettings(settingsRes);
      } catch (e) {
        console.error('Failed to load lists/tags/settings:', e);
      }
    };
    loadData();
  }, []);

  // 当 Modal 打开时，根据 URL 参数和用户设置设置默认值
  useEffect(() => {
    if (visible) {
      // 确定清单 ID：URL 参数 > 用户设置 > undefined
      const listId = currentListId || userSettings?.default_list_id || undefined;
      // 确定优先级：用户设置 > 0
      const priority = userSettings?.default_priority ?? 0;
      
      form.setFieldsValue({
        list_id: listId,
        priority: priority,
      });
      setTags(currentTag ? [currentTag] : []);
    }
  }, [visible, currentListId, currentTag, form, userSettings]);

  const handleOk = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();
      await addTask({
        ...values,
        tags,
        parent_task_id: parentId,
        start_time: values.start_time ? values.start_time.toISOString() : null,
        due_date: values.due_date ? values.due_date.toISOString() : null,
        reminder_time: values.reminder_time ? values.reminder_time.toISOString() : null,
      });
      form.resetFields();
      setTags([]);
      onClose();
    } catch (error) {
      console.error('创建任务失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setTags([]);
    onClose();
  };

  return (
    <Modal
      title="新建任务"
      open={visible}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      width={600}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="title"
          label="标题"
          rules={[{ required: true, message: '请输入任务标题' }]}
        >
          <Input placeholder="任务标题" />
        </Form.Item>

        <Form.Item name="description" label="描述">
          <TextArea rows={4} placeholder="任务描述" />
        </Form.Item>

        <Form.Item name="priority" label="优先级">
          <Select>
            <Option value={0}>无</Option>
            <Option value={1}><span style={{ color: 'red' }}>红旗</span></Option>
            <Option value={2}><span style={{ color: 'orange' }}>黄旗</span></Option>
            <Option value={3}><span style={{ color: 'blue' }}>蓝旗</span></Option>
            <Option value={4}><span style={{ color: 'gray' }}>灰旗</span></Option>
          </Select>
        </Form.Item>

        <Form.Item name="list_id" label="清单">
          <Select placeholder="选择清单" allowClear>
            {lists.filter(l => l.type === 'list').map(l => (
              <Option key={l.id} value={l.id}>
                <span style={{ 
                  display: 'inline-block', 
                  width: 8, 
                  height: 8, 
                  borderRadius: '50%', 
                  background: l.color, 
                  marginRight: 8 
                }} />
                {l.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="start_time" label="开始时间">
          <DatePicker
            showTime
            format="YYYY-MM-DD HH:mm"
            style={{ width: '100%' }}
            placeholder="请选择开始时间"
          />
        </Form.Item>

        <Form.Item name="due_date" label="截止时间">
          <DatePicker style={{ width: '100%' }} showTime />
        </Form.Item>

        <Form.Item name="reminder_time" label="提醒时间">
          <DatePicker style={{ width: '100%' }} showTime />
        </Form.Item>

        <Form.Item label="标签">
          <Select
            mode="tags"
            value={tags}
            onChange={setTags}
            placeholder="添加标签"
            style={{ width: '100%' }}
            options={allTags.map(t => ({ label: t.name, value: t.name }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default TaskCreateModal;
