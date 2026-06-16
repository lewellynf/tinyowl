import { useState } from 'react';
import { Button, Form, Input, Select, Switch, Alert, Typography } from 'antd';
import { SafetyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { SUPPORTED_MODELS } from '@tinyowl/shared';
import { createDetection, extractError } from '../api.js';

const { Text } = Typography;

export default function DetectionForm() {
  const [form] = Form.useForm();
  const [cacheOn, setCacheOn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const onFinish = async (values: {
    baseUrl: string;
    apiKey: string;
    targetModel: string;
    cacheDetection: boolean;
  }) => {
    setError(null);
    setSubmitting(true);
    try {
      const { taskId } = await createDetection({
        baseUrl: values.baseUrl.trim(),
        apiKey: values.apiKey.trim(),
        targetModel: values.targetModel,
        cacheDetection: values.cacheDetection ?? false,
      });
      navigate(`/result/${taskId}`);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      initialValues={{ cacheDetection: false }}
      requiredMark={false}
    >
      <Form.Item
        label="中转站接口地址"
        name="baseUrl"
        rules={[
          { required: true, message: '中转站接口地址不能为空' },
          {
            pattern: /^https?:\/\/.+/i,
            message: '接口地址格式无效',
          },
        ]}
      >
        <Input placeholder="https://your-relay.com 或 https://your-relay.com/v1" size="large" />
      </Form.Item>

      <Form.Item
        label="API Key"
        name="apiKey"
        rules={[{ required: true, message: 'API Key 不能为空' }]}
        extra={
          <Text className="to-privacy-tip">
            <SafetyOutlined /> 优先使用仅用于测试的 API Key，密钥端对端加密、用后即焚
          </Text>
        }
      >
        <Input.Password placeholder="sk-..." size="large" autoComplete="off" />
      </Form.Item>

      <Form.Item
        label="目标模型"
        name="targetModel"
        rules={[{ required: true, message: '请选择目标模型' }]}
      >
        <Select
          size="large"
          placeholder="请选择目标模型"
          options={SUPPORTED_MODELS.map((m) => ({ value: m.value, label: m.label }))}
          showSearch
          optionFilterProp="label"
        />
      </Form.Item>

      <Form.Item label="缓存检测" name="cacheDetection" valuePropName="checked">
        <Switch onChange={setCacheOn} />
      </Form.Item>
      {cacheOn && (
        <Alert
          type="info"
          showIcon
          message="开启缓存检测将额外增加约 30 秒"
          style={{ marginBottom: 16 }}
        />
      )}

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
        {submitting ? '正在发起检测…' : '开始检测'}
      </Button>
    </Form>
  );
}
