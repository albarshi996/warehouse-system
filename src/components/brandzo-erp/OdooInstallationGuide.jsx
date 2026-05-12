import React, { useState } from 'react';

const OdooInstallationGuide = () => {
  const [activeTab, setActiveTab] = useState('requirements');
  const [activePhase, setActivePhase] = useState(1);

  const requirements = [
    { category: 'Hardware', items: [
      { name: 'CPU', spec: '4 cores minimum (8 cores recommended)', status: 'required' },
      { name: 'RAM', spec: '8GB minimum (16GB recommended)', status: 'required' },
      { name: 'Storage', spec: '50GB SSD minimum (100GB recommended)', status: 'required' },
      { name: 'Network', spec: '1 Gbps connection', status: 'required' }
    ]},
    { category: 'Software', items: [
      { name: 'Operating System', spec: 'Ubuntu 20.04 LTS or CentOS 8', status: 'required' },
      { name: 'PostgreSQL', spec: 'Version 12 or higher', status: 'required' },
      { name: 'Python', spec: 'Version 3.8+', status: 'required' },
      { name: 'Node.js', spec: 'Version 14+', status: 'optional' }
    ]},
    { category: 'Domain & SSL', items: [
      { name: 'Domain Name', spec: 'Registered domain for your company', status: 'required' },
      { name: 'SSL Certificate', spec: 'SSL certificate for HTTPS', status: 'required' },
      { name: 'Email Server', spec: 'SMTP server for email notifications', status: 'recommended' }
    ]}
  ];

  const installationSteps = [
    {
      phase: 1,
      title: 'System Preparation',
      duration: '1-2 days',
      steps: [
        { title: 'Update System', command: 'sudo apt update && sudo apt upgrade -y', description: 'Update system packages to latest versions' },
        { title: 'Install Dependencies', command: 'sudo apt install -y python3-pip python3-dev python3-venv build-essential libxml2-dev libxslt1-dev libevent-dev libsasl2-dev libldap2-dev libpq-dev libjpeg-dev libpng-dev', description: 'Install required system dependencies' },
        { title: 'Create Odoo User', command: 'sudo useradd -m -s /bin/bash odoo', description: 'Create dedicated user for Odoo service' },
        { title: 'Install PostgreSQL', command: 'sudo apt install -y postgresql postgresql-contrib\nsudo -u postgres createuser -s odoo', description: 'Install and configure PostgreSQL database' }
      ]
    },
    {
      phase: 2,
      title: 'Odoo Installation',
      duration: '2-3 days',
      steps: [
        { title: 'Download Odoo', command: 'sudo -u odoo wget https://github.com/odoo/odoo/archive/17.0.tar.gz\nsudo -u odoo tar -xzf 17.0.tar.gz', description: 'Download and extract Odoo 17.0 source code' },
        { title: 'Install Python Dependencies', command: 'sudo -u odoo pip3 install -r /home/odoo/odoo-17.0/requirements.txt', description: 'Install Python packages required by Odoo' },
        { title: 'Create Configuration File', command: 'sudo mkdir /etc/odoo\nsudo nano /etc/odoo/odoo.conf', description: 'Create Odoo configuration file' },
        { title: 'Configure Database', command: '[options]\ndb_host = False\ndb_port = False\ndb_user = odoo\ndb_password = False\naddons_path = /home/odoo/odoo-17.0/addons', description: 'Configure database connection and addons path' }
      ]
    },
    {
      phase: 3,
      title: 'Service Configuration',
      duration: '1-2 days',
      steps: [
        { title: 'Create Systemd Service', command: 'sudo nano /etc/systemd/system/odoo17.service', description: 'Create systemd service file for Odoo' },
        { title: 'Service Configuration', command: '[Unit]\nDescription=Odoo17\nRequires=postgresql.service\nAfter=network.target postgresql.service\n\n[Service]\nType=simple\nSyslogIdentifier=odoo17\nPermissionsStartOnly=true\nUser=odoo\nGroup=odoo\nExecStart=/usr/bin/python3 /home/odoo/odoo-17.0/odoo-bin -c /etc/odoo/odoo.conf\nStandardOutput=journal+console\nStandardError=journal+console\n\n[Install]\nWantedBy=multi-user.target', description: 'Configure service parameters' },
        { title: 'Enable and Start Service', command: 'sudo systemctl daemon-reload\nsudo systemctl enable odoo17\nsudo systemctl start odoo17', description: 'Enable and start Odoo service' },
        { title: 'Check Service Status', command: 'sudo systemctl status odoo17', description: 'Verify Odoo service is running properly' }
      ]
    },
    {
      phase: 4,
      title: 'Web Server Setup',
      duration: '1-2 days',
      steps: [
        { title: 'Install Nginx', command: 'sudo apt install -y nginx', description: 'Install Nginx web server' },
        { title: 'Configure Nginx', command: 'server {\n    listen 80;\n    server_name your-domain.com;\n    \n    location / {\n        proxy_pass http://127.0.0.1:8069;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n    }\n}', description: 'Configure Nginx as reverse proxy' },
        { title: 'Install SSL Certificate', command: 'sudo apt install -y certbot python3-certbot-nginx\nsudo certbot --nginx -d your-domain.com', description: 'Install SSL certificate using Let\'s Encrypt' },
        { title: 'Test Configuration', command: 'sudo nginx -t\nsudo systemctl reload nginx', description: 'Test and reload Nginx configuration' }
      ]
    }
  ];

  const troubleshooting = [
    { issue: 'Service fails to start', solution: 'Check logs: sudo journalctl -u odoo17 -f. Common issues: database connection, file permissions, port conflicts.' },
    { issue: 'Database connection error', solution: 'Verify PostgreSQL is running: sudo systemctl status postgresql. Check user permissions and database exists.' },
    { issue: 'Module installation fails', solution: 'Check Python dependencies: pip3 list. Verify addon compatibility with Odoo version.' },
    { issue: 'Performance issues', solution: 'Enable caching, optimize database, consider using Redis for session storage.' },
    { issue: 'SSL certificate errors', solution: 'Verify domain DNS records, check certificate expiration, ensure proper Nginx configuration.' }
  ];

  const costs = {
    licenses: [
      { users: '1-10', cost: '$25/user/month', annual: '$300' },
      { users: '11-25', cost: '$23/user/month', annual: '$690' },
      { users: '26-50', cost: '$21/user/month', annual: '$1,260' },
      { users: '51-100', cost: '$19/user/month', annual: '$2,280' }
    ],
    hosting: [
      { type: 'VPS Basic', specs: '4GB RAM, 2 CPU, 80GB SSD', cost: '$40/month' },
      { type: 'VPS Professional', specs: '8GB RAM, 4 CPU, 160GB SSD', cost: '$80/month' },
      { type: 'Dedicated Server', specs: '16GB RAM, 8 CPU, 500GB SSD', cost: '$200/month' },
      { type: 'Cloud Enterprise', specs: '32GB RAM, 16 CPU, 1TB SSD', cost: '$500/month' }
    ],
    implementation: [
      { item: 'Basic Setup', duration: '1-2 weeks', cost: '$2,000-5,000' },
      { item: 'Custom Modules', duration: '2-4 weeks', cost: '$5,000-15,000' },
      { item: 'Data Migration', duration: '1-3 weeks', cost: '$3,000-10,000' },
      { item: 'Training', duration: '1-2 weeks', cost: '$1,000-3,000' }
    ]
  };

  return (
    <div className="text-right" dir="rtl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">
          دليل تثبيت أودو 17 Enterprise
          <span className="block text-lg font-normal text-gray-400 mt-1">Complete Odoo 17 Enterprise Installation Guide</span>
        </h1>
        <div className="w-20 h-1 bg-brand-red rounded-full mb-6" />
        
        <div className="bg-gradient-to-r from-blue-900/20 to-green-900/20 rounded-xl p-6 border border-blue-500/30">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-400">4</div>
              <div className="text-sm text-gray-400">مراحل التثبيت</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-400">2-4</div>
              <div className="text-sm text-gray-400">أسابيع للإكمال</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-400">$106-175K</div>
              <div className="text-sm text-gray-400">التكلفة الإجمالية</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-400">98.5%</div>
              <div className="text-sm text-gray-400">معدل النجاح</div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        {[
          { id: 'requirements', label: 'المتطلبات', icon: '📋' },
          { id: 'installation', label: 'التثبيت', icon: '⚙️' },
          { id: 'costs', label: 'التكاليف', icon: '💰' },
          { id: 'troubleshooting', label: 'المشاكل', icon: '🔧' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${
              activeTab === tab.id
                ? 'bg-brand-red text-white shadow-lg'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            <span className="ml-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Requirements Tab */}
      {activeTab === 'requirements' && (
        <div className="space-y-6">
          {requirements.map((category, i) => (
            <div key={i} className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">📦</span>
                {category.category}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {category.items.map((item, j) => (
                  <div key={j} className="bg-white/5 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-bold text-white">{item.name}</h4>
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        item.status === 'required' ? 'bg-red-500/20 text-red-400' :
                        item.status === 'recommended' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {item.status === 'required' ? 'مطلوب' : item.status === 'recommended' ? 'موصى به' : 'اختياري'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300">{item.spec}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Installation Tab */}
      {activeTab === 'installation' && (
        <div className="space-y-6">
          {/* Phase Selector */}
          <div className="flex flex-wrap gap-2 mb-6">
            {installationSteps.map((phase) => (
              <button
                key={phase.phase}
                onClick={() => setActivePhase(phase.phase)}
                className={`px-4 py-2 rounded-lg font-bold transition-all ${
                  activePhase === phase.phase
                    ? 'bg-green-500 text-white'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                المرحلة {phase.phase}: {phase.title}
              </button>
            ))}
          </div>

          {/* Phase Content */}
          {installationSteps.filter(p => p.phase === activePhase).map((phase) => (
            <div key={phase.phase} className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">
                  المرحلة {phase.phase}: {phase.title}
                </h3>
                <span className="text-sm text-gray-400 bg-white/10 px-3 py-1 rounded-full">
                  {phase.duration}
                </span>
              </div>
              
              <div className="space-y-4">
                {phase.steps.map((step, i) => (
                  <div key={i} className="bg-black/30 rounded-lg p-4">
                    <h4 className="font-bold text-green-400 mb-2">
                      {i + 1}. {step.title}
                    </h4>
                    <p className="text-sm text-gray-300 mb-3">{step.description}</p>
                    <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-gray-200 overflow-x-auto">
                      <pre>{step.command}</pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Costs Tab */}
      {activeTab === 'costs' && (
        <div className="space-y-6">
          {/* License Costs */}
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">تكاليف التراخيص</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="px-4 py-3 text-right text-blue-400">عدد المستخدمين</th>
                    <th className="px-4 py-3 text-right text-blue-400">التكلفة/الشهر</th>
                    <th className="px-4 py-3 text-right text-blue-400">التكلفة/السنة</th>
                  </tr>
                </thead>
                <tbody>
                  {costs.licenses.map((license, i) => (
                    <tr key={i} className="border-b border-white/10">
                      <td className="px-4 py-3 text-white">{license.users}</td>
                      <td className="px-4 py-3 text-gray-300">{license.cost}</td>
                      <td className="px-4 py-3 text-green-400 font-bold">{license.annual}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Hosting Costs */}
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">تكاليف الاستضافة</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {costs.hosting.map((hosting, i) => (
                <div key={i} className="bg-black/30 rounded-lg p-4">
                  <h4 className="font-bold text-blue-400 mb-2">{hosting.type}</h4>
                  <p className="text-sm text-gray-300 mb-2">{hosting.specs}</p>
                  <div className="text-lg font-bold text-yellow-400">{hosting.cost}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Implementation Costs */}
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">تكاليف التنفيذ</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {costs.implementation.map((impl, i) => (
                <div key={i} className="bg-black/30 rounded-lg p-4">
                  <h4 className="font-bold text-green-400 mb-2">{impl.item}</h4>
                  <p className="text-sm text-gray-300 mb-2">{impl.duration}</p>
                  <div className="text-lg font-bold text-purple-400">{impl.cost}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Troubleshooting Tab */}
      {activeTab === 'troubleshooting' && (
        <div className="space-y-4">
          {troubleshooting.map((item, i) => (
            <div key={i} className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-6">
              <h3 className="text-lg font-bold text-red-400 mb-3">
                🔴 {item.issue}
              </h3>
              <p className="text-gray-300">
                <span className="text-green-400 font-bold">الحل:</span> {item.solution}
              </p>
            </div>
          ))}
          
          <div className="bg-gradient-to-r from-yellow-900/20 to-orange-900/20 rounded-xl p-6 border border-yellow-500/30">
            <h3 className="text-lg font-bold text-yellow-400 mb-3">
              ⚠️ نصائح هامة
            </h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>• قم دائماً بأخذ نسخ احتياطية قبل إجراء أي تغييرات</li>
              <li>• استخدم بيئة اختبار قبل التطبيق على الإنتاج</li>
              <li>• راقب سجلات النظام بانتظام للكشف المبكر عن المشاكل</li>
              <li>• حافظ على تحديث النظام والأمان بانتظام</li>
              <li>• استعن بشريك أودو معتمد للدعم الفني</li>
            </ul>
          </div>
        </div>
      )}

      {/* Print Button */}
      <div className="mt-8 text-center">
        <button
          onClick={() => window.print()}
          className="px-8 py-3 bg-brand-red text-white rounded-xl font-bold hover:bg-brand-red-dark transition-all shadow-md hover:shadow-lg active:scale-95"
        >
          🖨️ طباعة الدليل
        </button>
      </div>
    </div>
  );
};

export default OdooInstallationGuide;