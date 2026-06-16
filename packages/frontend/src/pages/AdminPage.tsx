import { useEffect, useState } from 'react';
import {
  Button,
  Form,
  Input,
  Select,
  InputNumber,
  Table,
  Modal,
  Typography,
  message,
  Popconfirm,
  Space,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CERT_STATUS_LABELS,
  SUPPORTED_MODELS,
  type Channel,
  type CertStatus,
} from '@tinyowl/shared';
import {
  adminLogin,
  createChannel,
  deleteChannel,
  extractError,
  getLeaderboard,
  updateChannel,
} from '../api.js';

const { Title } = Typography;

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('tinyowl_admin_token'));
  const [loginForm] = Form.useForm();
  const [logging, setLogging] = useState(false);

  const onLogin = async (v: { username: string; password: string }) => {
    setLogging(true);
    try {
      const t = await adminLogin(v.username, v.password);
      localStorage.setItem('tinyowl_admin_token', t);
      setToken(t);
      message.success('登录成功');
    } catch (e) {
      message.error(extractError(e));
    } finally {
      setLogging(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('tinyowl_admin_token');
    setToken(null);
  };

  if (!token) {
    return (
      <div className="to-section">
        <div className="to-card" style={{ maxWidth: 420, margin: '0 auto' }}>
          <Title level={3} style={{ marginTop: 0 }}>运营登录</Title>
          <Form form={loginForm} layout="vertical" onFinish={onLogin}>
            <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input placeholder="admin" />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password placeholder="默认 tinyowl，可经环境变量修改" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={logging}>
              登录
            </Button>
          </Form>
        </div>
      </div>
    );
  }

  return <ChannelManager onUnauthorized={logout} onLogout={logout} />;
}

function ChannelManager({ onUnauthorized, onLogout }: { onUnauthorized: () => void; onLogout: () => void }) {
  const [model, setModel] = useState(SUPPORTED_MODELS[0].value);
  const [data, setData] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [form] = Form.useForm();

  const load = () => {
    setLoading(true);
    getLeaderboard({ model, sort: 'featured' })
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(load, [model]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue?.({ targetModel: model, certStatus: 'none', availabilityPct: 100, downgradeStatus: '未发现' });
    setModalOpen(true);
  };

  const openEdit = (c: Channel) => {
    setEditing(c);
    form.setFieldsValue(c);
    setModalOpen(true);
  };

  const handleError = (e: unknown) => {
    const msg = extractError(e);
    message.error(msg);
    if (msg.includes('未授权')) onUnauthorized();
  };

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await updateChannel(editing.id, values);
        message.success('已更新渠道');
      } else {
        await createChannel(values);
        message.success('已创建渠道');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      if ((e as { errorFields?: unknown }).errorFields) return; // 表单校验错误
      handleError(e);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteChannel(id);
      message.success('已删除');
      load();
    } catch (e) {
      handleError(e);
    }
  };

  const columns: ColumnsType<Channel> = [
    { title: '渠道名', dataIndex: 'name', key: 'name' },
    {
      title: '认证',
      dataIndex: 'certStatus',
      key: 'cert',
      render: (v: CertStatus) => <Tag>{CERT_STATUS_LABELS[v]}</Tag>,
    },
    { title: '价格', dataIndex: 'price', key: 'price', render: (v: number) => `¥${v}` },
    { title: '可用率', dataIndex: 'availabilityPct', key: 'avail', render: (v: number) => `${v}%` },
    { title: '精选权重', dataIndex: 'featuredWeight', key: 'fw' },
    {
      title: '操作',
      key: 'action',
      render: (_, r) => (
        <Space>
          <a onClick={() => openEdit(r)}>编辑</a>
          <Popconfirm title="确认删除该渠道？" onConfirm={() => onDelete(r.id)} okText="删除" cancelText="取消">
            <a style={{ color: '#cf1322' }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="to-section">
      <div className="to-card">
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={3} style={{ margin: 0 }}>渠道管理</Title>
          <Space>
            <Select
              value={model}
              onChange={setModel}
              style={{ width: 160 }}
              options={SUPPORTED_MODELS.map((m) => ({ value: m.value, label: m.label }))}
            />
            <Button type="primary" onClick={openCreate}>新增渠道</Button>
            <Button onClick={onLogout}>退出登录</Button>
          </Space>
        </Space>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} />
      </div>

      <Modal
        title={editing ? '编辑渠道' : '新增渠道'}
        open={modalOpen}
        onOk={onSubmit}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label="目标模型" name="targetModel" rules={[{ required: true, message: '请选择目标模型' }]}>
            <Select options={SUPPORTED_MODELS.map((m) => ({ value: m.value, label: m.label }))} />
          </Form.Item>
          <Form.Item label="渠道名" name="name" rules={[{ required: true, message: '渠道名不能为空' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="认证状态" name="certStatus" rules={[{ required: true, message: '请选择认证状态' }]}>
            <Select
              options={[
                { value: 'enterprise', label: '企业认证' },
                { value: 'personal', label: '个人实名认证' },
                { value: 'none', label: '未认证' },
              ]}
            />
          </Form.Item>
          <Form.Item label="价格(元/M)" name="price" rules={[{ required: true, message: '价格不能为空' }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="限速(RPM)" name="rateLimit">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="可用率(%)" name="availabilityPct">
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="降智情况" name="downgradeStatus">
            <Input placeholder="如：未发现 / 偶发 / 疑似" />
          </Form.Item>
          <Form.Item label="响应延迟(秒)" name="latencySeconds">
            <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="精选权重" name="featuredWeight">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
