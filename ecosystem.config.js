module.exports = {
  apps: [
    {
      name: "traj-backend",
      script: "gunicorn",
      args: "-w 4 -k gthread --threads 8 --timeout 120 -b 0.0.0.0:9091 wsgi:app",
      cwd: "backend",
      interpreter: "python", // Change to your venv path: "/path/to/venv/bin/python"
      watch: false,
      time: true,
      env: {
        NODE_ENV: "production"
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      instances: 1,
      exec_mode: "fork"
    }
  ]
};
